import { runnerHeartbeat } from "@doki/db/schema";
import { and, eq, lte } from "drizzle-orm";

import type { VoiceDispatcher } from "../calls/dispatch";
import {
	type PollableVoiceProvider,
	reconcileActiveCalls,
} from "../calls/reconcile";
import { type RunnerResult, runDueFollowUps } from "./runner";
import { reclaimStalled } from "./schedule";

export const FOLLOW_UP_RUNNER = "follow-ups";

export type DrainOutcome =
	| {
			ran: true;
			result: RunnerResult;
			reclaimed: number;
			/** In-flight calls refreshed by polling, for providers without webhooks. */
			reconciled: number;
	  }
	| { ran: false; reason: "TOO_SOON"; nextEligibleAt: Date }
	| { ran: false; reason: "BUSY" };

/**
 * Attempts to claim the right to drain, honouring a minimum interval.
 *
 * The UPDATE is the lock: it only matches when the recorded `last_run_at` is
 * older than the interval, so of N concurrent callers exactly one row-update
 * succeeds and the rest see zero rows affected. No advisory locks, no race —
 * Postgres serialises the update for us.
 */
async function tryClaimDrain(
	// biome-ignore lint/suspicious/noExplicitAny: drizzle db type is not portable across packages
	db: any,
	input: { minIntervalSeconds: number; triggeredBy: string },
): Promise<{ claimed: boolean; nextEligibleAt: Date }> {
	const now = new Date();
	const cutoff = new Date(now.getTime() - input.minIntervalSeconds * 1000);

	// First caller ever creates the row and wins by definition.
	const seeded = await db
		.insert(runnerHeartbeat)
		.values({
			name: FOLLOW_UP_RUNNER,
			lastRunAt: now,
			lastRunBy: input.triggeredBy,
		})
		.onConflictDoNothing()
		.returning({ name: runnerHeartbeat.name });

	if (seeded.length > 0) {
		return {
			claimed: true,
			nextEligibleAt: new Date(now.getTime() + input.minIntervalSeconds * 1000),
		};
	}

	const claimed = await db
		.update(runnerHeartbeat)
		.set({ lastRunAt: now, lastRunBy: input.triggeredBy })
		// Built with drizzle operators rather than a raw sql fragment: a raw
		// fragment passes the Date through untyped and postgres-js cannot bind it.
		.where(
			and(
				eq(runnerHeartbeat.name, FOLLOW_UP_RUNNER),
				lte(runnerHeartbeat.lastRunAt, cutoff),
			),
		)
		.returning({ name: runnerHeartbeat.name });

	if (claimed.length > 0) {
		return {
			claimed: true,
			nextEligibleAt: new Date(now.getTime() + input.minIntervalSeconds * 1000),
		};
	}

	const [current] = await db
		.select({ lastRunAt: runnerHeartbeat.lastRunAt })
		.from(runnerHeartbeat)
		.where(eq(runnerHeartbeat.name, FOLLOW_UP_RUNNER))
		.limit(1);

	const last = current?.lastRunAt ?? now;
	return {
		claimed: false,
		nextEligibleAt: new Date(last.getTime() + input.minIntervalSeconds * 1000),
	};
}

/**
 * Drains due follow-ups, at most once per interval across the whole system.
 *
 * This is the substitute for a background worker on a platform that has none.
 * Any authenticated console request can safely call it: the interval guard
 * means a hundred open tabs produce one drain, not a hundred.
 *
 * `force` bypasses only the interval, never the row-level claim — a manual
 * "run now" still cannot double-dial a lead.
 */
export async function drainFollowUps(
	// biome-ignore lint/suspicious/noExplicitAny: see above
	db: any,
	voice: VoiceDispatcher,
	input: {
		triggeredBy: string;
		minIntervalSeconds?: number;
		limit?: number;
		force?: boolean;
	},
): Promise<DrainOutcome> {
	const minIntervalSeconds = input.minIntervalSeconds ?? 120;

	if (!input.force) {
		const claim = await tryClaimDrain(db, {
			minIntervalSeconds,
			triggeredBy: input.triggeredBy,
		});
		if (!claim.claimed) {
			return {
				ran: false,
				reason: "TOO_SOON",
				nextEligibleAt: claim.nextEligibleAt,
			};
		}
	} else {
		await db
			.insert(runnerHeartbeat)
			.values({
				name: FOLLOW_UP_RUNNER,
				lastRunAt: new Date(),
				lastRunBy: input.triggeredBy,
			})
			.onConflictDoUpdate({
				target: runnerHeartbeat.name,
				set: { lastRunAt: new Date(), lastRunBy: input.triggeredBy },
			});
	}

	const reclaimed = await reclaimStalled(db).catch(() => 0);

	// Trial Twilio accounts cannot register a status callback, so no webhook
	// ever arrives. Polling here keeps those calls from sitting at QUEUED.
	const reconcile = await reconcileActiveCalls(
		db,
		voice as unknown as PollableVoiceProvider,
	).catch(() => ({ checked: 0, updated: 0, ended: 0 }));

	const runnerId = `${input.triggeredBy}-${Date.now().toString(36)}`;
	const result = await runDueFollowUps(db, voice, {
		runnerId,
		limit: input.limit ?? 10,
	});

	await db
		.update(runnerHeartbeat)
		.set({
			lastResult: {
				claimed: result.claimed,
				succeeded: result.succeeded,
				skipped: result.skipped,
				failed: result.failed,
				reclaimed,
			},
		})
		.where(eq(runnerHeartbeat.name, FOLLOW_UP_RUNNER));

	return { ran: true, result, reclaimed, reconciled: reconcile.updated };
}
