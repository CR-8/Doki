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

function createClient() {
	return postgres(env.DATABASE_URL, {
		prepare: false,
		max: 10,
		idle_timeout: 20,
		connect_timeout: 10,
	});
}

// Reuse across hot reloads in development, otherwise every recompile leaks a pool.
const sql = globalThis.__dokiSql ?? createClient();
if (env.NODE_ENV !== "production") globalThis.__dokiSql = sql;

export function createDb() {
	return drizzle(sql, { schema });
}

export const db = createDb();

export type Database = ReturnType<typeof createDb>;
export { sql as pgClient };
