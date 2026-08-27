// biome-ignore-all lint/complexity/noUselessLoneBlockStatements: blocks scope each test group's locals
import dotenv from "dotenv";

dotenv.config({ path: "../../apps/web/.env" });

const { randomUUID } = await import("node:crypto");
const { eq, inArray } = await import("drizzle-orm");
const { db, pgClient } = await import("@doki/db");
const schema = await import("@doki/db/schema");
const { claimDueFollowUps, runDueFollowUps } = await import(
	"../src/followups/runner"
);
const { cancelFollowUp, scheduleFollowUp } = await import(
	"../src/followups/schedule"
);

const { agent, followUpAction, lead, organization, organizationSettings } =
	schema;

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

// A throwaway tenant, removed at the end. Cascades clean up everything under it.
const orgId = `test_${randomUUID()}`;
const actor = { type: "SYSTEM" as const, id: "followups.check" };

async function cleanup() {
	await db.delete(organization).where(eq(organization.id, orgId));
}

try {
	await db.insert(organization).values({
		id: orgId,
		name: "Follow-up Test Org",
		slug: `followup-test-${randomUUID().slice(0, 8)}`,
	});
	await db.insert(organizationSettings).values({ organizationId: orgId });

	const [testAgent] = await db
		.insert(agent)
		.values({
			organizationId: orgId,
			name: "Test Agent",
			objective: "Verify follow-ups",
			instructions: "Say hello.",
			aiDisclosure: "Main ek AI assistant bol rahi hoon.",
			status: "ACTIVE",
		})
		.returning();

	if (!testAgent) throw new Error("Could not create test agent");

	const [testLead] = await db
		.insert(lead)
		.values({
			organizationId: orgId,
			name: "Test Lead",
			phoneRaw: "9000000001",
			phoneE164: "+919000000001",
			consentStatus: "GRANTED",
		})
		.returning();

	if (!testLead) throw new Error("Could not create test lead");

	const past = new Date(Date.now() - 60_000);

	console.log("\nScheduling:");
	{
		const first = await scheduleFollowUp(db, {
			organizationId: orgId,
			leadId: testLead.id,
			sourceCallId: null,
			agentId: testAgent.id,
			type: "CALL",
			dueAt: past,
			note: "Call back",
			actor,
			idempotencyKey: "test:dupe",
		});
		check("schedules a follow-up", Boolean(first), true);

		// Re-running analysis on the same call must not create a second row.
		const second = await scheduleFollowUp(db, {
			organizationId: orgId,
			leadId: testLead.id,
			sourceCallId: null,
			agentId: testAgent.id,
			type: "CALL",
			dueAt: past,
			note: "Call back",
			actor,
			idempotencyKey: "test:dupe",
		});
		check("re-scheduling is idempotent", second?.id, first?.id);

		const rows = await db
			.select({ id: followUpAction.id })
			.from(followUpAction)
			.where(eq(followUpAction.organizationId, orgId));
		check("exactly one row exists", rows.length, 1);
	}

	console.log("\nConcurrent claiming (the double-dial guard):");
	{
		// Seed a batch that is already due.
		const ids: string[] = [];
		for (let i = 0; i < 6; i++) {
			const row = await scheduleFollowUp(db, {
				organizationId: orgId,
				leadId: testLead.id,
				type: "CALL",
				dueAt: past,
				agentId: testAgent.id,
				actor,
				idempotencyKey: `test:batch:${i}`,
			});
			if (row) ids.push(row.id);
		}
		check("seeded 6 due follow-ups", ids.length, 6);

		// Two runners drain simultaneously, exactly as overlapping cron would.
		const [a, b] = await Promise.all([
			claimDueFollowUps(db, { limit: 10, runnerId: "runner-a" }),
			claimDueFollowUps(db, { limit: 10, runnerId: "runner-b" }),
		]);

		const idsA = new Set(a.map((r) => r.id));
		const idsB = new Set(b.map((r) => r.id));
		const overlap = [...idsA].filter((id) => idsB.has(id));

		check("no row claimed by both runners", overlap.length, 0);
		check("every due row claimed exactly once", idsA.size + idsB.size, 7);
		check(
			"claimed rows are marked RUNNING",
			[...a, ...b].every((r) => r.status === "RUNNING"),
			true,
		);
		check(
			"attempt counter incremented",
			[...a, ...b].every((r) => r.attempt === 1),
			true,
		);

		// Nothing is left claimable.
		const third = await claimDueFollowUps(db, {
			limit: 10,
			runnerId: "runner-c",
		});
		check("a third runner finds nothing", third.length, 0);

		// Reset for the next section.
		await db
			.update(followUpAction)
			.set({ status: "PENDING", lockedAt: null, lockedBy: null, attempt: 0 })
			.where(eq(followUpAction.organizationId, orgId));
	}

	console.log("\nExecution:");
	{
		// Keep one due row; park the rest in the future.
		const rows = await db
			.select({ id: followUpAction.id })
			.from(followUpAction)
			.where(eq(followUpAction.organizationId, orgId));

		const keep = rows[0]?.id;
		if (!keep) throw new Error("expected at least one follow-up row");
		await db
			.update(followUpAction)
			.set({ dueAt: new Date(Date.now() + 86_400_000) })
			.where(
				inArray(
					followUpAction.id,
					rows.slice(1).map((r) => r.id),
				),
			);

		// A fake dispatcher — this must never touch a real carrier.
		const placed: string[] = [];
		const fakeVoice = {
			name: "fake",
			async placeCall(req: { toNumber: string }) {
				placed.push(req.toNumber);
				return { providerCallId: `fake_${randomUUID()}`, status: "QUEUED" };
			},
		};

		const result = await runDueFollowUps(db, fakeVoice, {
			runnerId: "runner-x",
		});
		check("claimed exactly the due row", result.claimed, 1);

		const [settled] = await db
			.select({
				status: followUpAction.status,
				lockedBy: followUpAction.lockedBy,
			})
			.from(followUpAction)
			.where(eq(followUpAction.id, keep));

		// Outcome depends on the calling window at runtime: inside hours it
		// dials, outside it defers. Both are correct — what must hold is that
		// the row never stays stuck in RUNNING, and the lock is released.
		check("row settled out of RUNNING", settled?.status !== "RUNNING", true);
		check("lock released", settled?.lockedBy, null);
		console.log(
			`       (settled as ${settled?.status}, ${placed.length} call(s) placed)`,
		);
	}

	console.log("\nCancellation:");
	{
		const [pending] = await db
			.select({ id: followUpAction.id })
			.from(followUpAction)
			.where(eq(followUpAction.status, "PENDING"))
			.limit(1);

		if (pending) {
			const canceled = await cancelFollowUp(db, {
				organizationId: orgId,
				id: pending.id,
				actor,
				reason: "test",
			});
			check("cancels a pending follow-up", canceled, true);

			// Cancelling twice must not silently "succeed" a second time.
			const again = await cancelFollowUp(db, {
				organizationId: orgId,
				id: pending.id,
				actor,
			});
			check("cancelling an already-cancelled row is a no-op", again, false);
		}
	}
} finally {
	await cleanup();
	await pgClient.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
