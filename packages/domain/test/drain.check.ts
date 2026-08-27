// biome-ignore-all lint/complexity/noUselessLoneBlockStatements: blocks scope each test group's locals
import dotenv from "dotenv";

dotenv.config({ path: "../../apps/web/.env" });

const { randomUUID } = await import("node:crypto");
const { eq } = await import("drizzle-orm");
const { db, pgClient } = await import("@doki/db");
const schema = await import("@doki/db/schema");
const { drainFollowUps, FOLLOW_UP_RUNNER } = await import(
	"../src/followups/drain"
);

const { organization, organizationSettings, runnerHeartbeat } = schema;

let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (ok) {
		pass++;
		console.log(`  ok   ${label}`);
	} else {
		fail++;
		console.log(
			`  FAIL ${label}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`,
		);
	}
}

const orgId = `test_${randomUUID()}`;

/** Never touches a carrier. */
const fakeVoice = {
	name: "fake",
	async placeCall() {
		return { providerCallId: `fake_${randomUUID()}`, status: "QUEUED" };
	},
};

// The heartbeat row is global, so preserve and restore whatever is there.
const [existing] = await db
	.select()
	.from(runnerHeartbeat)
	.where(eq(runnerHeartbeat.name, FOLLOW_UP_RUNNER));

try {
	await db.insert(organization).values({
		id: orgId,
		name: "Drain Test Org",
		slug: `drain-test-${randomUUID().slice(0, 8)}`,
	});
	await db.insert(organizationSettings).values({ organizationId: orgId });

	// Start from a clean slate so the first drain is guaranteed eligible.
	await db
		.delete(runnerHeartbeat)
		.where(eq(runnerHeartbeat.name, FOLLOW_UP_RUNNER));

	console.log("\nInterval guard (many tabs must produce one drain):");
	{
		const first = await drainFollowUps(db, fakeVoice, {
			triggeredBy: "test",
			minIntervalSeconds: 120,
		});
		check("first drain runs", first.ran, true);

		const second = await drainFollowUps(db, fakeVoice, {
			triggeredBy: "test",
			minIntervalSeconds: 120,
		});
		check("an immediate second drain is refused", second.ran, false);
		check(
			"and says why",
			second.ran === false ? second.reason : null,
			"TOO_SOON",
		);
	}

	console.log("\nConcurrent callers:");
	{
		// Simulate ten browser tabs heartbeating at the same instant.
		await db
			.delete(runnerHeartbeat)
			.where(eq(runnerHeartbeat.name, FOLLOW_UP_RUNNER));

		const results = await Promise.all(
			Array.from({ length: 10 }, () =>
				drainFollowUps(db, fakeVoice, {
					triggeredBy: "test",
					minIntervalSeconds: 120,
				}),
			),
		);

		const ran = results.filter((r) => r.ran).length;
		check("exactly one of ten concurrent drains runs", ran, 1);
		check("the other nine are refused", results.length - ran, 9);
	}

	console.log("\nForce bypasses the interval:");
	{
		const forced = await drainFollowUps(db, fakeVoice, {
			triggeredBy: "test",
			minIntervalSeconds: 120,
			force: true,
		});
		check("forced drain runs despite a recent one", forced.ran, true);
	}

	console.log("\nHeartbeat bookkeeping:");
	{
		const [row] = await db
			.select()
			.from(runnerHeartbeat)
			.where(eq(runnerHeartbeat.name, FOLLOW_UP_RUNNER));

		check("heartbeat row exists", Boolean(row), true);
		check("records who triggered it", row?.lastRunBy, "test");
		check("records the last result", typeof row?.lastResult, "object");
	}

	console.log("\nInterval elapsed:");
	{
		// Backdate the heartbeat rather than sleeping.
		await db
			.update(runnerHeartbeat)
			.set({ lastRunAt: new Date(Date.now() - 5 * 60 * 1000) })
			.where(eq(runnerHeartbeat.name, FOLLOW_UP_RUNNER));

		const after = await drainFollowUps(db, fakeVoice, {
			triggeredBy: "test",
			minIntervalSeconds: 120,
		});
		check("drain runs again once the interval passes", after.ran, true);
	}
} finally {
	await db.delete(organization).where(eq(organization.id, orgId));
	await db
		.delete(runnerHeartbeat)
		.where(eq(runnerHeartbeat.name, FOLLOW_UP_RUNNER));
	if (existing)
		await db.insert(runnerHeartbeat).values(existing).onConflictDoNothing();
	await pgClient.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
