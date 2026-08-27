import dotenv from "dotenv";

// Env lives with the web app; load it before anything reads process.env.
dotenv.config({ path: "../../apps/web/.env" });

const { sql } = await import("drizzle-orm");

const { createDb, pgClient } = await import("../src/index");

/**
 * Smoke test for the postgres-js driver swap. The important assertion is the
 * transaction one: neon-http could not do interactive transactions, which is
 * why call dispatch needed this change.
 */
const db = createDb();

const version = await db.execute(sql`select version()`);
console.log("connected:", String(version[0]?.version ?? "").slice(0, 40));

const tables = await db.execute(
	sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
);
console.log("public tables:", tables[0]?.n);

// Transactions must actually roll back — this is the whole point of the swap.
let rolledBack = false;
try {
	await db.transaction(async (tx) => {
		await tx.execute(sql`create temporary table _tx_probe (id int)`);
		throw new Error("intentional rollback");
	});
} catch {
	rolledBack = true;
}
console.log("transaction rollback works:", rolledBack);

const committed = await db.transaction(async (tx) => {
	const rows = await tx.execute(sql`select 1 as ok`);
	return rows[0]?.ok === 1;
});
console.log("transaction commit works:", committed);

await pgClient.end();
process.exit(rolledBack && committed ? 0 : 1);
