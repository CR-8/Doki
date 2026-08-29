import {
	type Call,
	callMessage,
	call as callTable,
	lead as leadTable,
	suppressionEntry,
	usageEvent,
} from "@doki/db/schema";
import { env } from "@doki/env/server";
import { and, eq, sql } from "drizzle-orm";

import { recordAudit } from "../audit";

export type IngestTurn = {
	role: "assistant" | "user";
	content: string;
	offsetMs: number;
};

export type IngestEvent =
	| { kind: "STATUS"; providerCallId: string; status: string; occurredAt: Date }
	| { kind: "TRANSCRIPT"; providerCallId: string; turns: IngestTurn[] }
	| {
			kind: "ENDED";
			providerCallId: string;
			status: string;
			endedReason: string | null;
			durationSeconds: number;
			recordingUrl: string | null;
			transcriptText: string | null;
			turns: IngestTurn[];
			providerCostUsd: number | null;
			occurredAt: Date;
	  };

export type IngestResult =
	| {
			handled: true;
			callId: string;
			organizationId: string;
			duplicate: boolean;
			/** True once the call has reached a terminal state — analysis can run. */
			ended: boolean;
	  }
	| { handled: false; reason: string };

/** Statuses that mean the call is over and must not be reopened. */
const TERMINAL = new Set([
	"COMPLETED",
	"FAILED",
	"BUSY",
	"NO_ANSWER",
	"VOICEMAIL",
	"CANCELED",
]);

/**
 * Estimated cost of a call in INR, from configured rate cards.
 *
 * Kept as configuration rather than hardcoded numbers so re-pricing is an env
 * change, and so the same figures drive both customer billing and our own
 * margin reporting.
 */
export function estimateCallCost(input: {
	durationSeconds: number;
	assistantCharacters: number;
	/**
	 * Whether speech-to-text actually ran.
	 *
	 * Not every call is a conversation. The telephony-only path plays a
	 * synthesised message and hangs up — nothing is transcribed, so charging
	 * per-minute STT against it invents a cost the customer never incurred.
	 */
	transcribed?: boolean;
}): {
	telephony: number;
	stt: number;
	tts: number;
	llm: number;
	platform: number;
	total: number;
} {
	const minutes = input.durationSeconds / 60;

	const telephony = minutes * env.COST_TELEPHONY_INR_PER_MIN;
	const stt = input.transcribed ? minutes * env.COST_STT_INR_PER_MIN : 0;
	const tts =
		(input.assistantCharacters / 10_000) * env.COST_TTS_INR_PER_10K_CHARS;
	// Rough token proxy: ~4 characters per token, and roughly as much prompt
	// context per turn as output. Replaced by real provider usage when available.
	const outputTokens = input.assistantCharacters / 4;
	const llm =
		(outputTokens / 1000) * env.COST_LLM_INR_PER_1K_OUTPUT +
		((outputTokens * 6) / 1000) * env.COST_LLM_INR_PER_1K_INPUT;
	const platform = minutes * env.COST_PLATFORM_INR_PER_MIN;

	const round = (n: number) => Math.round(n * 10_000) / 10_000;
	return {
		telephony: round(telephony),
		stt: round(stt),
		tts: round(tts),
		llm: round(llm),
		platform: round(platform),
		total: round(telephony + stt + tts + llm + platform),
	};
}

/**
 * Applies one provider event to our own state.
 *
 * Every path is idempotent: providers redeliver webhooks, and a redelivered
 * end-of-call report must not double-count minutes or duplicate transcripts.
 */
export async function ingestVoiceEvent(
	// biome-ignore lint/suspicious/noExplicitAny: drizzle db type is not portable across packages
	db: any,
	event: IngestEvent,
): Promise<IngestResult> {
	const [existing] = (await db
		.select()
		.from(callTable)
		.where(eq(callTable.providerCallId, event.providerCallId))
		.limit(1)) as Call[];

	if (!existing) {
		return {
			handled: false,
			reason: `Unknown provider call ${event.providerCallId}`,
		};
	}

	if (event.kind === "STATUS") {
		// Never move a finished call back to an in-flight state; out-of-order
		// delivery is normal.
		if (TERMINAL.has(existing.status)) {
			return {
				handled: true,
				callId: existing.id,
				organizationId: existing.organizationId,
				duplicate: true,
				ended: true,
			};
		}
		await db
			.update(callTable)
			.set({
				status: event.status as Call["status"],
				answeredAt:
					event.status === "IN_PROGRESS" && !existing.answeredAt
						? event.occurredAt
						: existing.answeredAt,
			})
			.where(eq(callTable.id, existing.id));
		return {
			handled: true,
			callId: existing.id,
			organizationId: existing.organizationId,
			duplicate: false,
			ended: false,
		};
	}

	if (event.kind === "TRANSCRIPT") {
		await appendTurns(db, existing, event.turns);
		return {
			handled: true,
			callId: existing.id,
			organizationId: existing.organizationId,
			duplicate: false,
			ended: false,
		};
	}

	// --- ENDED -------------------------------------------------------------
	if (existing.endedAt) {
		return {
			handled: true,
			callId: existing.id,
			organizationId: existing.organizationId,
			duplicate: true,
			ended: true,
		};
	}

	const assistantCharacters = event.turns
		.filter((t) => t.role === "assistant")
		.reduce((sum, t) => sum + t.content.length, 0);

	const connected = event.status === "COMPLETED" && event.durationSeconds > 0;
	const billableSeconds = connected ? event.durationSeconds : 0;
	const cost = estimateCallCost({
		durationSeconds: billableSeconds,
		assistantCharacters,
		// Evidence that audio was actually run through recognition, rather than
		// an assumption that every call is a conversation.
		transcribed: event.turns.length > 0 || Boolean(event.transcriptText),
	});

	await db.transaction(async (tx: typeof db) => {
		await tx
			.update(callTable)
			.set({
				status: event.status as Call["status"],
				endedAt: event.occurredAt,
				endedReason: event.endedReason,
				durationSeconds: event.durationSeconds,
				billableSeconds,
				recordingUrl: event.recordingUrl,
				transcriptText: event.transcriptText,
				telephonyCostInr: String(cost.telephony),
				sttCostInr: String(cost.stt),
				ttsCostInr: String(cost.tts),
				llmCostInr: String(cost.llm),
				platformCostInr: String(cost.platform),
				totalCostInr: String(cost.total),
			})
			.where(eq(callTable.id, existing.id));

		if (event.turns.length > 0) {
			await tx
				.insert(callMessage)
				.values(
					event.turns.map((turn, index) => ({
						organizationId: existing.organizationId,
						callId: existing.id,
						role: turn.role,
						content: turn.content,
						offsetMs: turn.offsetMs,
						sequence: index,
					})),
				)
				.onConflictDoNothing();
		}

		if (billableSeconds > 0) {
			await tx
				.insert(usageEvent)
				.values([
					{
						organizationId: existing.organizationId,
						callId: existing.id,
						kind: "CALL_SECONDS" as const,
						provider: existing.provider,
						units: String(billableSeconds),
						totalCostInr: String(cost.telephony + cost.platform),
						idempotencyKey: `usage:call:${existing.id}`,
					},
					{
						organizationId: existing.organizationId,
						callId: existing.id,
						kind: "TTS_CHARACTERS" as const,
						provider: existing.provider,
						units: String(assistantCharacters),
						totalCostInr: String(cost.tts),
						idempotencyKey: `usage:tts:${existing.id}`,
					},
				])
				.onConflictDoNothing();
		}
	});

	await recordAudit(db, {
		organizationId: existing.organizationId,
		actor: { type: "PROVIDER", id: existing.provider },
		action: "call.ended",
		resourceType: "call",
		resourceId: existing.id,
		reason: event.endedReason,
		metadata: {
			durationSeconds: event.durationSeconds,
			totalCostInr: cost.total,
		},
	});

	return {
		handled: true,
		callId: existing.id,
		organizationId: existing.organizationId,
		duplicate: false,
		ended: true,
	};
}

async function appendTurns(
	// biome-ignore lint/suspicious/noExplicitAny: drizzle db type is not portable across packages
	db: any,
	existing: Call,
	turns: IngestTurn[],
): Promise<void> {
	if (turns.length === 0) return;

	const [row] = await db
		.select({
			value: sql<number>`cast(coalesce(max(${callMessage.sequence}), -1) as int)`,
		})
		.from(callMessage)
		.where(eq(callMessage.callId, existing.id));

	const base = (row?.value ?? -1) + 1;

	await db
		.insert(callMessage)
		.values(
			turns.map((turn, index) => ({
				organizationId: existing.organizationId,
				callId: existing.id,
				role: turn.role,
				content: turn.content,
				offsetMs: turn.offsetMs,
				sequence: base + index,
			})),
		)
		.onConflictDoNothing();
}

/**
 * Honours an opt-out heard on a call.
 *
 * Writes the suppression entry, flips the lead, and records consent
 * revocation in one transaction — a partially applied opt-out is the single
 * worst failure this system can have.
 */
export async function applyOptOut(
	// biome-ignore lint/suspicious/noExplicitAny: see above
	db: any,
	input: {
		organizationId: string;
		leadId: string;
		phoneE164: string;
		freezeDays: number;
		note?: string;
	},
): Promise<void> {
	const until = new Date(Date.now() + input.freezeDays * 24 * 3600 * 1000);

	await db.transaction(async (tx: typeof db) => {
		await tx
			.insert(suppressionEntry)
			.values({
				organizationId: input.organizationId,
				phoneE164: input.phoneE164,
				reason: "USER_OPT_OUT" as const,
				notes: input.note ?? "Requested during call",
				suppressedUntil: until,
			})
			.onConflictDoNothing();

		await tx
			.update(leadTable)
			.set({ status: "SUPPRESSED", consentStatus: "REVOKED" })
			.where(
				and(
					eq(leadTable.organizationId, input.organizationId),
					eq(leadTable.id, input.leadId),
				),
			);
	});

	await recordAudit(db, {
		organizationId: input.organizationId,
		actor: { type: "SYSTEM" },
		action: "lead.opted_out",
		resourceType: "lead",
		resourceId: input.leadId,
		reason: input.note ?? "Requested during call",
		metadata: { suppressedUntil: until.toISOString() },
	});
}
