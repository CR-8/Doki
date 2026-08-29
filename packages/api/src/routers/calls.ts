import {
	buildAnalysisSystemPrompt,
	buildAnalysisUserPrompt,
	callAnalysisSchema,
	getLlmProvider,
} from "@doki/connectors/llm/index";
import type { VoiceProvider } from "@doki/connectors/voice/index";
import {
	agent as agentTable,
	callAnalysis,
	callMessage,
	call as callTable,
	lead as leadTable,
} from "@doki/db/schema";
import { analyzeCall, applyOptOut, dispatchCall } from "@doki/domain";
import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { tenantProcedure } from "../index";
import { audioPublisher } from "../lib/audio-publisher";
import { invalidateDashboard } from "../lib/cache";
import { resolveVoiceForOrg } from "../lib/telephony";

export const callsRouter = {
	list: tenantProcedure
		.input(
			z.object({
				limit: z.number().int().min(1).max(100).default(25),
				offset: z.number().int().min(0).default(0),
				status: z
					.enum([
						"QUEUED",
						"DIALING",
						"RINGING",
						"IN_PROGRESS",
						"COMPLETED",
						"FAILED",
						"BUSY",
						"NO_ANSWER",
						"VOICEMAIL",
						"CANCELED",
					])
					.optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			const where = input.status
				? and(
						eq(callTable.organizationId, organizationId),
						eq(callTable.status, input.status),
					)
				: eq(callTable.organizationId, organizationId);

			const rows = await db
				.select({
					id: callTable.id,
					status: callTable.status,
					outcome: callTable.outcome,
					direction: callTable.direction,
					purpose: callTable.purpose,
					toNumber: callTable.toNumber,
					durationSeconds: callTable.durationSeconds,
					billableSeconds: callTable.billableSeconds,
					totalCostInr: callTable.totalCostInr,
					endedReason: callTable.endedReason,
					recordingUrl: callTable.recordingUrl,
					createdAt: callTable.createdAt,
					endedAt: callTable.endedAt,
					attempt: callTable.attempt,
					leadName: leadTable.name,
					leadCompany: leadTable.company,
					agentName: agentTable.name,
					summary: callAnalysis.summary,
				})
				.from(callTable)
				.leftJoin(leadTable, eq(callTable.leadId, leadTable.id))
				.leftJoin(agentTable, eq(callTable.agentId, agentTable.id))
				.leftJoin(callAnalysis, eq(callAnalysis.callId, callTable.id))
				.where(where)
				.orderBy(desc(callTable.createdAt))
				.limit(input.limit)
				.offset(input.offset);

			const [totalRow] = await db
				.select({ value: count() })
				.from(callTable)
				.where(where);

			// Roll-up for the header strip: connect rate and spend at a glance.
			const [stats] = await db
				.select({
					total: count(),
					connected: sql<number>`cast(count(*) filter (where ${callTable.billableSeconds} > 0) as int)`,
					talkSeconds: sql<number>`cast(coalesce(sum(${callTable.billableSeconds}), 0) as int)`,
					spendInr: sql<number>`coalesce(sum(${callTable.totalCostInr}), 0)`,
				})
				.from(callTable)
				.where(eq(callTable.organizationId, organizationId));

			return {
				calls: rows,
				total: totalRow?.value ?? 0,
				stats: {
					total: stats?.total ?? 0,
					connected: stats?.connected ?? 0,
					talkSeconds: stats?.talkSeconds ?? 0,
					spendInr: Number(stats?.spendInr ?? 0),
				},
			};
		}),

	get: tenantProcedure
		.input(z.object({ id: z.uuid() }))
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			const [row] = await db
				.select()
				.from(callTable)
				.where(
					and(
						eq(callTable.organizationId, organizationId),
						eq(callTable.id, input.id),
					),
				)
				.limit(1);

			if (!row) throw new ORPCError("NOT_FOUND", { message: "Call not found" });

			const messages = await db
				.select()
				.from(callMessage)
				.where(eq(callMessage.callId, row.id))
				.orderBy(asc(callMessage.sequence));

			const [analysis] = await db
				.select()
				.from(callAnalysis)
				.where(eq(callAnalysis.callId, row.id))
				.limit(1);

			const [lead] = row.leadId
				? await db
						.select()
						.from(leadTable)
						.where(eq(leadTable.id, row.leadId))
						.limit(1)
				: [null];

			const [agent] = row.agentId
				? await db
						.select()
						.from(agentTable)
						.where(eq(agentTable.id, row.agentId))
						.limit(1)
				: [null];

			return {
				call: row,
				messages,
				analysis: analysis ?? null,
				lead: lead ?? null,
				agent: agent ?? null,
			};
		}),

	/**
	 * Places a call. The policy gate runs inside `dispatchCall`, so a refusal
	 * here never reaches the provider — and is returned as data rather than an
	 * exception, because "we correctly refused" is a normal outcome, not an error.
	 */
	dispatch: tenantProcedure
		.input(
			z.object({
				leadId: z.uuid(),
				agentId: z.uuid(),
				purpose: z.enum(["PROMOTIONAL", "TRANSACTIONAL", "SERVICE"]).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId, user } = context;

			// Dial from the workspace's own account when it has one — the customer
			// owns the number and the DLT registration, so the bill and the caller
			// ID have to be theirs too.
			let voice: VoiceProvider;
			try {
				const resolved = await resolveVoiceForOrg(db, organizationId, {
					audio: audioPublisher,
				});
				voice = resolved.voice;
			} catch (error) {
				throw new ORPCError("PRECONDITION_FAILED", {
					message:
						error instanceof Error
							? error.message
							: "Voice provider not configured",
				});
			}

			const result = await dispatchCall(db, voice, {
				organizationId,
				leadId: input.leadId,
				agentId: input.agentId,
				purpose: input.purpose,
				actor: { type: "USER", id: user.id },
			});

			if (result.ok) {
				return {
					ok: true as const,
					callId: result.call.id,
					status: result.call.status,
				};
			}

			if (result.kind === "POLICY") {
				return {
					ok: false as const,
					kind: "POLICY" as const,
					code: result.decision.code,
					reason: result.decision.reason,
				};
			}

			return {
				ok: false as const,
				kind: "ERROR" as const,
				code: null,
				reason: result.message,
			};
		}),

	/**
	 * Runs post-call analysis. Normally fired automatically when a call ends;
	 * exposed here so a low-confidence result can be re-run by hand.
	 */
	analyze: tenantProcedure
		.input(z.object({ callId: z.uuid(), force: z.boolean().default(false) }))
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			let llm: ReturnType<typeof getLlmProvider>;
			try {
				llm = getLlmProvider();
			} catch (error) {
				throw new ORPCError("PRECONDITION_FAILED", {
					message:
						error instanceof Error ? error.message : "LLM not configured",
				});
			}

			const result = await analyzeCall(
				db,
				llm,
				{
					callAnalysisSchema,
					buildAnalysisSystemPrompt,
					buildAnalysisUserPrompt,
				},
				{ organizationId, callId: input.callId, force: input.force },
			);

			if (!result.ok) {
				throw new ORPCError("BAD_REQUEST", { message: result.reason });
			}

			await invalidateDashboard(organizationId);
			return result;
		}),

	/** Manual opt-out. Same code path an in-call opt-out will use. */
	optOut: tenantProcedure
		.input(
			z.object({
				leadId: z.uuid(),
				note: z.string().trim().max(300).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			const [lead] = await db
				.select()
				.from(leadTable)
				.where(
					and(
						eq(leadTable.organizationId, organizationId),
						eq(leadTable.id, input.leadId),
					),
				)
				.limit(1);

			if (!lead)
				throw new ORPCError("NOT_FOUND", { message: "Lead not found" });

			await applyOptOut(db, {
				organizationId,
				leadId: lead.id,
				phoneE164: lead.phoneE164,
				freezeDays: 90,
				note: input.note,
			});

			await invalidateDashboard(organizationId);
			return { ok: true };
		}),
};
