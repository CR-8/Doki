import dotenv from "dotenv";

dotenv.config({ path: "../../apps/web/.env" });

const { randomUUID } = await import("node:crypto");
const { and, eq } = await import("drizzle-orm");
const { db, pgClient } = await import("@doki/db");
const schema = await import("@doki/db/schema");
const { parseLeadCsv } = await import("../src/leads/import");

const { consentRecord, lead, organization, organizationSettings } = schema;

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
const userId = null;

/** Mirrors exactly what leads.commitImport does. */
async function commit(csv: string, granted: boolean) {
	const preview = parseLeadCsv(csv);
	const now = new Date();

	const rows = preview.valid.map((l) => ({
		organizationId: orgId,
		name: l.name,
		company: l.company,
		email: l.email,
		phoneRaw: l.phoneRaw,
		phoneE164: l.phoneE164,
		phoneCountry: l.phoneCountry,
		source: l.source ?? "csv-import",
		timezone: l.timezone,
		consentStatus: granted ? ("GRANTED" as const) : ("UNKNOWN" as const),
		consentSource: granted ? ("IMPORT_ATTESTED" as const) : null,
		consentAt: granted ? now : null,
		consentAttestedBy: userId,
	}));

	const inserted = await db
		.insert(lead)
		.values(rows)
		.onConflictDoNothing({ target: [lead.organizationId, lead.phoneE164] })
		.returning({ id: lead.id, phoneE164: lead.phoneE164 });

	if (granted && inserted.length > 0) {
		await db.insert(consentRecord).values(
			inserted.map((r) => ({
				organizationId: orgId,
				leadId: r.id,
				phoneE164: r.phoneE164,
				status: "GRANTED" as const,
				source: "IMPORT_ATTESTED" as const,
				attestedBy: userId,
				occurredAt: now,
			})),
		);
	}

	return {
		created: inserted.length,
		alreadyExisted: preview.valid.length - inserted.length,
	};
}

try {
	await db.insert(organization).values({
		id: orgId,
		name: "Import Test Org",
		slug: `import-test-${randomUUID().slice(0, 8)}`,
	});
	await db.insert(organizationSettings).values({ organizationId: orgId });

	console.log("\nFirst import:");
	{
		const csv = [
			"Name,Mobile,Company",
			"Rohan,98765 43210,Acme",
			"Priya,+91-9876543211,Beta",
			"Amit,09876543212,Gamma",
		].join("\n");

		const result = await commit(csv, true);
		check("all three created", result.created, 3);
		check("none pre-existing", result.alreadyExisted, 0);

		const rows = await db
			.select({ phone: lead.phoneE164, consent: lead.consentStatus })
			.from(lead)
			.where(eq(lead.organizationId, orgId));
		check("rows persisted", rows.length, 3);
		check(
			"consent recorded as granted",
			rows.every((r) => r.consent === "GRANTED"),
			true,
		);

		const records = await db
			.select({ id: consentRecord.id })
			.from(consentRecord)
			.where(eq(consentRecord.organizationId, orgId));
		check("consent provenance written", records.length, 3);
	}

	console.log(
		"\nOpt-out survives a re-import (the one that must never break):",
	);
	{
		// Simulate someone asking not to be called again after the first import.
		await db
			.update(lead)
			.set({ consentStatus: "REVOKED", status: "SUPPRESSED" })
			.where(
				and(
					eq(lead.organizationId, orgId),
					eq(lead.phoneE164, "+919876543210"),
				),
			);

		// The customer re-uploads the same spreadsheet, attesting consent again.
		const csv = [
			"Name,Mobile,Company",
			"Rohan,98765 43210,Acme",
			"Sneha,9876543213,Delta",
		].join("\n");

		const result = await commit(csv, true);
		check("only the genuinely new lead is created", result.created, 1);
		check(
			"the existing one is reported, not rewritten",
			result.alreadyExisted,
			1,
		);

		const [rohan] = await db
			.select({ consent: lead.consentStatus, status: lead.status })
			.from(lead)
			.where(
				and(
					eq(lead.organizationId, orgId),
					eq(lead.phoneE164, "+919876543210"),
				),
			);

		check("opt-out NOT overwritten by the import", rohan?.consent, "REVOKED");
		check("suppressed status preserved", rohan?.status, "SUPPRESSED");

		const total = await db
			.select({ id: lead.id })
			.from(lead)
			.where(eq(lead.organizationId, orgId));
		check("no duplicate row created", total.length, 4);
	}

	console.log("\nFormat variance collapses to one lead:");
	{
		// The same number written five different ways, as a real list would.
		const csv = [
			"Name,Phone",
			"A,9000000009",
			"B,+919000000009",
			"C,09000000009",
			"D,919000000009",
			"E,+91 90000 00009",
		].join("\n");

		const preview = parseLeadCsv(csv);
		check(
			"four rejected as in-file duplicates",
			preview.duplicatesInFile.length,
			4,
		);
		check("one survives", preview.valid.length, 1);

		const result = await commit(csv, false);
		check("one row created", result.created, 1);
	}
} finally {
	await db.delete(organization).where(eq(organization.id, orgId));
	await pgClient.end();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
