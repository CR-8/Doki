import dotenv from "dotenv";

dotenv.config({ path: "../../apps/web/.env" });

const { sql } = await import("drizzle-orm");
const { db, pgClient } = await import("../src/index");

/** Tables added after the initial schema; a deploy must have these pushed. */
const RECENT = ["tts_asset", "follow_up_action", "runner_heartbeat"];

const rows = await db.execute(
	sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
);
const present = new Set(
	rows.map((r: Record<string, unknown>) => String(r.table_name)),
);

console.log(`tables in database: ${present.size}`);
for (const table of RECENT) {
	console.log(
		`  ${table.padEnd(20)} ${present.has(table) ? "present" : "MISSING"}`,
	);
}

await pgClient.end();
process.exit(RECENT.every((t) => present.has(t)) ? 0 : 1);
