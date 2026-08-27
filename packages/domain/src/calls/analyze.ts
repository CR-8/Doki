import {
	type Call,
	callAnalysis,
	callMessage,
	call as callTable,
	type Lead,
	lead as leadTable,
	organizationSettings,
	usageEvent,
} from "@doki/db/schema";
import { env } from "@doki/env/server";
import { and, asc, desc, eq, ne } from "drizzle-orm";

import { recordAudit } from "../audit";
import { applyOptOut } from "./ingest";

/**
 * Structural shape of the LLM connector, declared locally so this package does
 * not depend on @doki/connectors (which would create a cycle). Deliberately
 * non-generic: the real provider constrains its schema parameter to z.ZodType,
 * and an unconstrained generic here would not accept it.
 */
export type AnalysisLlm = {
	readonly name: string;
	generateStructured(req: {
		system: string;
		messages: { role: "system" | "user" | "assistant"; content: string }[];
		// biome-ignore lint/suspicious/noExplicitAny: the concrete Zod schema is supplied by the caller
		schema: any;
		schemaName: string;
		model?: string;
		temperature?: number;
		maxOutputTokens?: number;
	}): Promise<{
		// biome-ignore lint/suspicious/noExplicitAny: shape is enforced by that Zod schema at runtime
		data: any;
		usage: { inputTokens: number; outputTokens: number };
		model: string;
		raw: unknown;
	}>;
};

export type AnalysisSchemaBundle = {
	// biome-ignore lint/suspicious/noExplicitAny: the concrete Zod schema lives in @doki/connectors
	callAnalysisSchema: any;
	buildAnalysisSystemPrompt: () => string;
	buildAnalysisUserPrompt: (input: {
		objective: string;
		lead: {
			name: string | null;
			company: string | null;
			status: string;
			previousCalls: number;
			lastSummary: string | null;
		};
		transcript: string;
	}) => string;
};

export type AnalyzeResult =
	| {
			ok: true;
			callId: string;
			promoted: boolean;
			outcome: string;
			optedOut: boolean;
	  }
	| { ok: false; reason: string };

/**
 * Confidence floor for acting on the model's proposed outcome.
 *
 * Below this the analysis is still stored and shown, but `call.outcome` stays
 * UNKNOWN so a human decides. Speech-to-text mangles names and numbers often
 * enough that a low-confidence read should never silently move a lead.
 */
const PROMOTE_THRESHOLD = 0.6;

/** Where each sales outcome leaves the lead. Deterministic, not model-decided. */
const LEAD_STATUS_FOR_OUTCOME: Record<string, Lead["status"] | null> = {
	INTERESTED: "CONTACTED",
	QUALIFIED: "QUALIFIED",
	MEETING_BOOKED: "MEETING_BOOKED",
	CALLBACK_REQUESTED: "CONTACTED",
	NOT_INTERESTED: "NOT_INTERESTED",
	WRONG_NUMBER: "UNREACHABLE",
	DO_NOT_CALL: "SUPPRESSED",
	UNKNOWN: null,
};

function renderTranscript(
	messages: { role: string; content: string; offsetMs: number }[],
	fallback: string | null,
): string {
	if (messages.length > 0) {
		return messages
			.map(
				(m) => `${m.role === "assistant" ? "Agent" : "Caller"}: ${m.content}`,
			)
			.join("\n");
	}
	return fallback ?? "";
}

/**
 * Runs post-call analysis and applies its conclusions.
 *
 * The division of labour is the point: the model PROPOSES an outcome, and this
 * function decides whether that proposal is allowed to change any state. It
 * runs asynchronously after the call, so nothing here is on the latency path.
 */
export async function analyzeCall(
	// biome-ignore lint/suspicious/noExplicitAny: drizzle db type is not portable across packages
	db: any,
	llm: AnalysisLlm,
	schemas: AnalysisSchemaBundle,
	input: { organizationId: string; callId: string; force?: boolean },
): Promise<AnalyzeResult> {
	const { organizationId, callId } = input;

	const [call] = (await db
		.select()
		.from(callTable)
		.where(
			and(
				eq(callTable.organizationId, organizationId),
				eq(callTable.id, callId),
			),
		)
		.limit(1)) as Call[];

	if (!call) return { ok: false, reason: "Call not found" };
	if (!call.endedAt) return { ok: false, reason: "Call has not ended yet" };

	// Idempotent: analysis is unique per call unless explicitly re-run.
	const [existing] = await db
		.select({ id: callAnalysis.id })
		.from(callAnalysis)
		.where(eq(callAnalysis.callId, callId))
		.limit(1);
	if (existing && !input.force) {
		return { ok: false, reason: "Call has already been analysed" };
	}

	const messages = await db
		.select({
			role: callMessage.role,
			content: callMessage.content,
			offsetMs: callMessage.offsetMs,
		})
		.from(callMessage)
		.where(eq(callMessage.callId, callId))
		.orderBy(asc(callMessage.sequence));

	const transcript = renderTranscript(messages, call.transcriptText);
	if (!transcript.trim()) {
		return { ok: false, reason: "No transcript to analyse" };
	}

	const [lead] = call.leadId
		? ((await db
				.select()
				.from(leadTable)
				.where(eq(leadTable.id, call.leadId))
				.limit(1)) as Lead[])
		: [undefined];

	// Compact prior context: one earlier summary, not the whole history.
	const [previous] = call.leadId
		? await db
				.select({ summary: callAnalysis.summary })
				.from(callAnalysis)
				.innerJoin(callTable, eq(callAnalysis.callId, callTable.id))
				.where(and(eq(callTable.leadId, call.leadId), ne(callTable.id, callId)))
				.orderBy(desc(callAnalysis.createdAt))
				.limit(1)
		: [undefined];

	const objective = "Understand the outcome of this sales call.";

	let result: Awaited<ReturnType<AnalysisLlm["generateStructured"]>>;
	try {
		result = await llm.generateStructured({
			system: schemas.buildAnalysisSystemPrompt(),
			messages: [
				{
					role: "user",
					content: schemas.buildAnalysisUserPrompt({
						objective,
						lead: {
							name: lead?.name ?? null,
							company: lead?.company ?? null,
							status: lead?.status ?? "UNKNOWN",
							previousCalls: Math.max((lead?.attemptCount ?? 1) - 1, 0),
							lastSummary: previous?.summary ?? null,
						},
						transcript,
					}),
				},
			],
			schema: schemas.callAnalysisSchema,
			schemaName: "call_analysis",
			temperature: 0.1,
			maxOutputTokens: 900,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Analysis failed";
		await recordAudit(db, {
			organizationId,
			actor: { type: "AI" },
			action: "call.analysis.failed",
			resourceType: "call",
			resourceId: callId,
			reason: message.slice(0, 500),
		});
		return { ok: false, reason: message };
	}

	const analysis = result.data;
	const flags: string[] = analysis.guardrailFlags ?? [];
	const requestedOptOut = flags.includes("REQUESTED_OPT_OUT");

	// --- Deterministic promotion -----------------------------------------
	// An opt-out is acted on regardless of confidence; everything else needs
	// the model to be reasonably sure before it moves the lead.
	const confident = analysis.confidence >= PROMOTE_THRESHOLD;
	const promoted = confident || requestedOptOut;
	const finalOutcome: string = requestedOptOut
		? "DO_NOT_CALL"
		: promoted
			? analysis.outcome
			: "UNKNOWN";

	const nextActionAt =
		analysis.nextActionInHours != null
			? new Date(Date.now() + analysis.nextActionInHours * 3600 * 1000)
			: null;

	await db.transaction(async (tx: typeof db) => {
		await tx
			.insert(callAnalysis)
			.values({
				organizationId,
				callId,
				summary: analysis.summary,
				proposedOutcome: analysis.outcome,
				objections: analysis.objections ?? [],
				qualification: analysis.qualification ?? {},
				nextAction: analysis.nextAction,
				nextActionAt,
				confidence: analysis.confidence,
				guardrailFlags: flags,
				model: result.model,
				rawOutput: analysis,
			})
			.onConflictDoUpdate({
				target: callAnalysis.callId,
				set: {
					summary: analysis.summary,
					proposedOutcome: analysis.outcome,
					objections: analysis.objections ?? [],
					qualification: analysis.qualification ?? {},
					nextAction: analysis.nextAction,
					nextActionAt,
					confidence: analysis.confidence,
					guardrailFlags: flags,
					model: result.model,
					rawOutput: analysis,
				},
			});

		await tx
			.update(callTable)
			.set({ outcome: finalOutcome as Call["outcome"] })
			.where(eq(callTable.id, callId));

		// Meter the analysis call so its cost lands against the same call.
		await tx
			.insert(usageEvent)
			.values([
				{
					organizationId,
					callId,
					kind: "LLM_INPUT_TOKENS" as const,
					provider: llm.name,
					model: result.model,
					units: String(result.usage.inputTokens),
					totalCostInr: String(
						(result.usage.inputTokens / 1000) * env.COST_LLM_INR_PER_1K_INPUT,
					),
					idempotencyKey: `usage:analysis:in:${callId}`,
				},
				{
					organizationId,
					callId,
					kind: "LLM_OUTPUT_TOKENS" as const,
					provider: llm.name,
					model: result.model,
					units: String(result.usage.outputTokens),
					totalCostInr: String(
						(result.usage.outputTokens / 1000) * env.COST_LLM_INR_PER_1K_OUTPUT,
					),
					idempotencyKey: `usage:analysis:out:${callId}`,
				},
			])
			.onConflictDoNothing();

		if (lead && promoted && !requestedOptOut) {
			const nextStatus = LEAD_STATUS_FOR_OUTCOME[finalOutcome];
			if (nextStatus) {
				await tx
					.update(leadTable)
					.set({ status: nextStatus })
					.where(eq(leadTable.id, lead.id));
			}
		}
	});

	// --- Opt-out is applied outside the analysis write, on its own path ---
	let optedOut = false;
	if (requestedOptOut && lead) {
		const [settings] = await db
			.select()
			.from(organizationSettings)
			.where(eq(organizationSettings.organizationId, organizationId))
			.limit(1);

		await applyOptOut(db, {
			organizationId,
			leadId: lead.id,
			phoneE164: lead.phoneE164,
			freezeDays: settings?.optOutFreezeDays ?? 90,
			note: "Requested during call (detected in transcript)",
		});
		optedOut = true;
	}

	await recordAudit(db, {
		organizationId,
		actor: { type: "AI", id: result.model },
		action: promoted ? "call.analysis.applied" : "call.analysis.held",
		resourceType: "call",
		resourceId: callId,
		reason: promoted
			? null
			: `Confidence ${analysis.confidence.toFixed(2)} below ${PROMOTE_THRESHOLD} threshold; left for human review.`,
		metadata: {
			proposedOutcome: analysis.outcome,
			appliedOutcome: finalOutcome,
			confidence: analysis.confidence,
			guardrailFlags: flags,
		},
	});

	return { ok: true, callId, promoted, outcome: finalOutcome, optedOut };
}
