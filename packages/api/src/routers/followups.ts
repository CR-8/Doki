import { getVoiceProvider } from "@doki/connectors/voice/index";
import {
	agent as agentTable,
	followUpAction,
	lead as leadTable,
} from "@doki/db/schema";
import { cancelFollowUp, drainFollowUps, scheduleFollowUp } from "@doki/domain";
import { ORPCError } from "@orpc/server";
import { and, asc, count, eq, lte } from "drizzle-orm";
import { z } from "zod";

import { tenantProcedure } from "../index";
import { audioPublisher } from "../lib/audio-publisher";

export const followUpsRouter = {
	list: tenantProcedure
		.input(
			z.object({
				status: z
					.enum([
						"PENDING",
						"RUNNING",
						"SUCCEEDED",
						"FAILED",
						"CANCELED",
						"SKIPPED",
					])
					.optional(),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			const where = input.status
				? and(
						eq(followUpAction.organizationId, organizationId),
						eq(followUpAction.status, input.status),
					)
				: eq(followUpAction.organizationId, organizationId);

			const rows = await db
				.select({
					id: followUpAction.id,
					type: followUpAction.type,
					status: followUpAction.status,
					dueAt: followUpAction.dueAt,
					note: followUpAction.note,
					source: followUpAction.source,
					attempt: followUpAction.attempt,
					maxAttempts: followUpAction.maxAttempts,
					lastError: followUpAction.lastError,
					completedAt: followUpAction.completedAt,
					leadId: followUpAction.leadId,
					leadName: leadTable.name,
					leadPhone: leadTable.phoneE164,
					agentName: agentTable.name,
				})
				.from(followUpAction)
				.leftJoin(leadTable, eq(followUpAction.leadId, leadTable.id))
				.leftJoin(agentTable, eq(followUpAction.agentId, agentTable.id))
				.where(where)
				.orderBy(asc(followUpAction.dueAt))
				.limit(input.limit);

			const [pending] = await db
				.select({ value: count() })
				.from(followUpAction)
				.where(
					and(
						eq(followUpAction.organizationId, organizationId),
						eq(followUpAction.status, "PENDING"),
					),
				);

			const [dueNow] = await db
				.select({ value: count() })
				.from(followUpAction)
				.where(
					and(
						eq(followUpAction.organizationId, organizationId),
						eq(followUpAction.status, "PENDING"),
						lte(followUpAction.dueAt, new Date()),
					),
				);

			return {
				actions: rows,
				pending: pending?.value ?? 0,
				dueNow: dueNow?.value ?? 0,
			};
		}),

	/**
	 * Drains due follow-ups.
	 *
	 * This deployment has no background worker, so draining is driven by
	 * console traffic instead. Safe to call from any open tab: a system-wide
	 * interval guard means many callers produce one drain, and the underlying
	 * claim query prevents double-dialling regardless.
	 */
	drain: tenantProcedure
		.input(z.object({ force: z.boolean().default(false) }))
		.handler(async ({ context, input }) => {
			const { db } = context;

			let voice: ReturnType<typeof getVoiceProvider>;
			try {
				voice = getVoiceProvider({ audio: audioPublisher });
			} catch {
				// Nothing to drain into — report quietly rather than erroring in
				// the background heartbeat.
				return { ran: false as const, reason: "NO_PROVIDER" as const };
			}

			const outcome = await drainFollowUps(db, voice, {
				triggeredBy: "console",
				force: input.force,
			});

			if (!outcome.ran) {
				return { ran: false as const, reason: outcome.reason };
			}

			return {
				ran: true as const,
				claimed: outcome.result.claimed,
				succeeded: outcome.result.succeeded,
				skipped: outcome.result.skipped,
				failed: outcome.result.failed,
				reclaimed: outcome.reclaimed,
			};
		}),

	/** Manually schedule a follow-up, e.g. from the lead or call screen. */
	create: tenantProcedure
		.input(
			z.object({
				leadId: z.uuid(),
				type: z.enum(["CALL", "EMAIL", "TASK", "MEETING"]).default("CALL"),
				/** Relative scheduling keeps timezone maths on the server. */
				inHours: z.number().int().min(0).max(2160).default(24),
				note: z.string().trim().max(300).optional(),
				agentId: z.uuid().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId, user } = context;

			const [lead] = await db
				.select({ id: leadTable.id })
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

			const dueAt = new Date(Date.now() + input.inHours * 3600 * 1000);

			const created = await scheduleFollowUp(db, {
				organizationId,
				leadId: input.leadId,
				type: input.type,
				dueAt,
				note: input.note ?? null,
				agentId: input.agentId ?? null,
				source: "MANUAL",
				actor: { type: "USER", id: user.id },
				// Manual scheduling is intentional, so it gets a unique key rather
				// than collapsing onto an existing row.
				idempotencyKey: `manual:${input.leadId}:${input.type}:${dueAt.toISOString()}`,
			});

			if (!created) {
				throw new ORPCError("CONFLICT", {
					message: "Could not schedule follow-up",
				});
			}
			return created;
		}),

	cancel: tenantProcedure
		.input(
			z.object({ id: z.uuid(), reason: z.string().trim().max(300).optional() }),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId, user } = context;

			const canceled = await cancelFollowUp(db, {
				organizationId,
				id: input.id,
				actor: { type: "USER", id: user.id },
				reason: input.reason,
			});

			if (!canceled) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Only pending follow-ups can be canceled",
				});
			}
			return { ok: true };
		}),

	/** Brings a pending follow-up forward so it runs on the next drain. */
	runNow: tenantProcedure
		.input(z.object({ id: z.uuid() }))
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			const [updated] = await db
				.update(followUpAction)
				.set({ dueAt: new Date() })
				.where(
					and(
						eq(followUpAction.organizationId, organizationId),
						eq(followUpAction.id, input.id),
						eq(followUpAction.status, "PENDING"),
					),
				)
				.returning({ id: followUpAction.id, dueAt: followUpAction.dueAt });

			if (!updated) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Only pending follow-ups can be brought forward",
				});
			}

			return {
				ok: true,
				dueAt: updated.dueAt,
				note: "Runs on the next scheduled drain.",
			};
		}),
};

export type FollowUpsRouter = typeof followUpsRouter;
