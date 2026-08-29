import { env } from "@doki/env/server";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * Postgres client.
 *
 * Uses postgres-js rather than Neon's HTTP driver because dispatching a call
 * needs a real interactive transaction: the call row and its idempotency key
 * must be claimed atomically with the lead's attempt counter, or a crash
 * between the two writes can produce a duplicate dial.
 *
 * `prepare: false` is required when connecting through Neon's pooled endpoint
 * (PgBouncer in transaction mode does not support prepared statements).
 */
declare global {
	// eslint-disable-next-line no-var
	var __dokiSql: ReturnType<typeof postgres> | undefined;
}

/**
 * Serverless platforms run many short-lived instances concurrently, and each
 * one would otherwise open its own pool — exhausting the database's connection
 * limit long before the app is under real load. One connection per instance,
 * fanned out behind PgBouncer, is the correct shape there.
 */
const isServerless = Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME);

function createClient() {
	return postgres(env.DATABASE_URL, {
		prepare: false,
		max: isServerless ? 1 : 10,
		idle_timeout: isServerless ? 10 : 20,
		/**
		 * Sized for a cold start, not a warm one.
		 *
		 * Neon suspends the compute when idle, and the first connection after
		 * that has to wait for it to wake — which regularly exceeds ten seconds
		 * once the TLS handshake and channel binding are included. Failing fast
		 * there is the wrong trade: it turns "the database was asleep" into a
		 * 500 on the first page load after any quiet period, which is precisely
		 * when someone is being shown the product.
		 */
		connect_timeout: 30,
	});
}

// Reuse across hot reloads in development, otherwise every recompile leaks a
// pool. On serverless this also reuses the connection across warm invocations.
const sql = globalThis.__dokiSql ?? createClient();
if (env.NODE_ENV !== "production" || isServerless) globalThis.__dokiSql = sql;

export function createDb() {
	return drizzle(sql, { schema });
}

export const db = createDb();

export type Database = ReturnType<typeof createDb>;
export { sql as pgClient };
