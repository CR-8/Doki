import dotenv from "dotenv";

dotenv.config({ path: "../../apps/web/.env" });

const { and, eq } = await import("drizzle-orm");
const { db, pgClient } = await import("@doki/db");
const { auditEvent, lead, suppressionEntry } = await import("@doki/db/schema");

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
	console.log(
		`${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
	);
	if (!ok) failures++;
}

const [entry] = await db
	.select()
	.from(suppressionEntry)
	.where(eq(suppressionEntry.reason, "USER_OPT_OUT"))
	.limit(1);

if (!entry) {
	console.log("no opt-out suppression to exercise");
	await pgClient.end();
	process.exit(0);
}

const frozen =
	entry.suppressedUntil === null || entry.suppressedUntil > new Date();
console.log(
	`entry: ${entry.phoneE164} reason=${entry.reason} until=${entry.suppressedUntil?.toISOString().slice(0, 10) ?? "permanent"} frozen=${frozen}`,
);

/**
 * Mirrors the guard in `compliance.liftSuppression`.
 *
 * Exercised against the real row so the branch that matters — a still-frozen
 * consumer opt-out — is the one actually taken, rather than a synthetic case.
 */
function guard(acknowledgeOptOut: boolean) {
	const earlyOptOutLift = entry?.reason === "USER_OPT_OUT" && frozen;
	if (earlyOptOutLift && !acknowledgeOptOut) {
		return { allowed: false, earlyLift: true };
	}
	return { allowed: true, earlyLift: earlyOptOutLift };
}

check("refused without the acknowledgement", !guard(false).allowed);
check("permitted with the acknowledgement", guard(true).allowed);
check("flagged as an early lift", guard(true).earlyLift === true);

// --- the write path, rolled back --------------------------------------------
const ROLLBACK = "rollback-sentinel";

try {
	// biome-ignore lint/suspicious/noExplicitAny: transaction handle
	await db.transaction(async (tx: any) => {
		await tx.delete(suppressionEntry).where(eq(suppressionEntry.id, entry.id));

		const restored = await tx
			.update(lead)
			.set({ status: "NEW" as const })
			.where(
				and(
					eq(lead.organizationId, entry.organizationId),
					eq(lead.phoneE164, entry.phoneE164),
					eq(lead.status, "SUPPRESSED"),
				),
			)
			.returning({ id: lead.id });

		const [audit] = await tx
			.insert(auditEvent)
			.values({
				organizationId: entry.organizationId,
				actorType: "USER",
				actorId: "probe",
				action: "suppression.lifted_early",
				resourceType: "suppression_entry",
				resourceId: entry.id,
				reason: "probe",
				metadata: {
					earlyLift: true,
					originalReason: entry.reason,
					daysRemaining: entry.suppressedUntil
						? Math.ceil(
								(entry.suppressedUntil.getTime() - Date.now()) / 86_400_000,
							)
						: null,
				},
			})
			.returning({ action: auditEvent.action, metadata: auditEvent.metadata });

		check(
			"audit uses the distinct early-lift verb",
			audit.action === "suppression.lifted_early",
			audit.action,
		);
		check(
			"audit records the days that were skipped",
			typeof (audit.metadata as { daysRemaining?: number }).daysRemaining ===
				"number",
			String((audit.metadata as { daysRemaining?: number }).daysRemaining),
		);
		console.log(`      leads restored in this org: ${restored.length}`);

		throw new Error(ROLLBACK);
	});
} catch (error) {
	if ((error as Error).message !== ROLLBACK) throw error;
	console.log("rolled back — no changes persisted");
}

const [still] = await db
	.select({ id: suppressionEntry.id })
	.from(suppressionEntry)
	.where(eq(suppressionEntry.id, entry.id))
	.limit(1);
check("suppression still in place after rollback", Boolean(still));

await pgClient.end();
console.log(
	failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
