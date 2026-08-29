import { type Call, call as callTable } from "@doki/db/schema";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";

import { type IngestEvent, ingestVoiceEvent } from "./ingest";

/** Provider surface needed to poll. Optional — not every provider supports it. */
export type PollableVoiceProvider = {
	readonly name: string;
	fetchCall?(providerCallId: string): Promise<IngestEvent | null>;
};

/** Calls that have not reached a terminal state yet. */
const IN_FLIGHT = ["QUEUED", "DIALING", "RINGING", "IN_PROGRESS"] as const;

export type ReconcileResult = {
	checked: number;
	updated: number;
	ended: number;
};

/**
 * Brings in-flight calls up to date by asking the provider directly.
 *
 * Webhooks are the primary path, but they are not always available: a Twilio
 * trial account cannot register a status callback at all, so without this a
 * call would sit at QUEUED forever and the console would look broken.
 *
 * Polling is deliberately narrow — only calls already past a grace period, and
 * only a small batch — because it costs an API round trip each. Webhooks
 * remain the mechanism; this is the safety net under them.
 */
export async function reconcileActiveCalls(
	// biome-ignore lint/suspicious/noExplicitAny: drizzle db type is not portable across packages
	db: any,
	voice: PollableVoiceProvider,
	input: { limit?: number; minAgeSeconds?: number; now?: Date } = {},
): Promise<ReconcileResult> {
	const result: ReconcileResult = { checked: 0, updated: 0, ended: 0 };

	// A provider without polling relies solely on webhooks; nothing to do.
	if (typeof voice.fetchCall !== "function") return result;

	const now = input.now ?? new Date();
	const cutoff = new Date(now.getTime() - (input.minAgeSeconds ?? 20) * 1000);

	const stale = (await db
		.select()
		.from(callTable)
		.where(
			and(
				eq(callTable.provider, voice.name),
				inArray(callTable.status, [...IN_FLIGHT]),
				isNotNull(callTable.providerCallId),
				lte(callTable.queuedAt, cutoff),
			),
		)
		.limit(input.limit ?? 20)) as Call[];

	for (const row of stale) {
		if (!row.providerCallId) continue;
		result.checked++;

		const event = await voice.fetchCall(row.providerCallId);
		if (!event) continue;

		// Reuse the webhook ingest path so polled and pushed updates settle
		// identically — same idempotency, same cost attribution, same audit.
		const ingested = await ingestVoiceEvent(db, event);
		if (!ingested.handled || ingested.duplicate) continue;

		result.updated++;
		if (ingested.ended) result.ended++;
	}

	return result;
}
