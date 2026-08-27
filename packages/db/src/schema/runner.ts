import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Last-run bookkeeping for background drains.
 *
 * Exists because this deployment has no long-lived worker: drains are
 * triggered opportunistically by app traffic rather than by a daemon. Without
 * a shared record of when one last ran, every open browser tab would trigger
 * its own, and a busy console would hammer the queue.
 *
 * Row-per-runner, keyed by name. Concurrency safety still comes from the
 * follow-up claim query itself (FOR UPDATE SKIP LOCKED) — this only stops
 * pointless work, it is not the correctness boundary.
 */
export const runnerHeartbeat = pgTable("runner_heartbeat", {
	/** e.g. "follow-ups" */
	name: text("name").primaryKey(),
	lastRunAt: timestamp("last_run_at").defaultNow().notNull(),
	/** "cron" | "console" | "manual" — how the drain was triggered. */
	lastRunBy: text("last_run_by"),
	lastResult: jsonb("last_result")
		.$type<Record<string, unknown>>()
		.default({})
		.notNull(),
});

export type RunnerHeartbeat = typeof runnerHeartbeat.$inferSelect;
