import dotenv from "dotenv";

dotenv.config({ path: "../../apps/web/.env" });

const { and, eq } = await import("drizzle-orm");
const { db, pgClient } = await import("../src/index");
const schema = await import("../src/schema");

const { consentRecord, lead: leadTable, organization } = schema;

const [org] = await db
	.select({ id: organization.id })
	.from(organization)
	.limit(1);
const [target] = org
	? await db
			.select()
			.from(leadTable)
			.where(eq(leadTable.organizationId, org.id))
			.limit(1)
	: [null];

if (!org || !target) {
	console.log("no lead to exercise — skipping");
	await pgClient.end();
	process.exit(0);
}

const ROLLBACK = "rollback-sentinel";

/**
 * Runs the write paths for real, then rolls back.
 *
 * Proves the SQL and constraints hold without leaving test data in a database
 * the user is demoing from.
 */
try {
	// biome-ignore lint/suspicious/noExplicitAny: transaction handle
	await db.transaction(async (tx: any) => {
		const [updated] = await tx
			.update(leadTable)
			.set({ name: "Rollback Probe", company: "Probe Co", status: "CONTACTED" })
			.where(
				and(
					eq(leadTable.organizationId, org.id),
					eq(leadTable.id, target.id),
				),
			)
			.returning();
		console.log(
			`leads.update     ok — name now "${updated.name}", status ${updated.status}`,
		);

		const now = new Date();
		const [consented] = await tx
			.update(leadTable)
			.set({
				consentStatus: "GRANTED",
				consentSource: "WEB_FORM",
				consentAt: now,
				consentEvidence: "probe",
			})
			.where(eq(leadTable.id, target.id))
			.returning();

		const [record] = await tx
			.insert(consentRecord)
			.values({
				organizationId: org.id,
				leadId: target.id,
				phoneE164: target.phoneE164,
				status: "GRANTED",
				source: "WEB_FORM",
				evidence: "probe",
				occurredAt: now,
			})
			.returning();
		console.log(
			`leads.setConsent ok — lead ${consented.consentStatus}, trail row ${record.id.slice(0, 8)}`,
		);

		throw new Error(ROLLBACK);
	});
} catch (error) {
	if ((error as Error).message !== ROLLBACK) throw error;
	console.log("rolled back — no changes persisted");
}

const [after] = await db
	.select()
	.from(leadTable)
	.where(eq(leadTable.id, target.id))
	.limit(1);
console.log(
	`verified: name is "${after?.name}", status ${after?.status}, consent ${after?.consentStatus}`,
);

await pgClient.end();
