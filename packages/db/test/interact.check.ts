import dotenv from "dotenv";

dotenv.config({ path: "../../apps/web/.env" });

const { and, count, desc, eq, gt, ilike, isNull, or } = await import(
	"drizzle-orm"
);
const { db, pgClient } = await import("../src/index");
const schema = await import("../src/schema");

const {
	agent: agentTable,
	callAnalysis,
	call: callTable,
	consentRecord,
	followUpAction,
	lead: leadTable,
	suppressionEntry,
} = schema;

const [org] = await db
	.select({ id: schema.organization.id, name: schema.organization.name })
	.from(schema.organization)
	.limit(1);

if (!org) {
	console.log("no workspace in database — nothing to exercise");
	await pgClient.end();
	process.exit(0);
}

console.log(`workspace: ${org.name} (${org.id})`);

// --- leads.list with search + status ---------------------------------------
const term = "a";
const digits = "98";
const where = and(
	eq(leadTable.organizationId, org.id),
	eq(leadTable.status, "NEW"),
	or(
		ilike(leadTable.name, `%${term}%`),
		ilike(leadTable.company, `%${term}%`),
		ilike(leadTable.email, `%${term}%`),
		ilike(leadTable.phoneE164, `%${digits}%`),
	),
);
const filtered = await db
	.select({ id: leadTable.id })
	.from(leadTable)
	.where(where)
	.orderBy(desc(leadTable.createdAt))
	.limit(25);
const [filteredTotal] = await db
	.select({ value: count() })
	.from(leadTable)
	.where(where);
console.log(
	`leads.list  search+status filter ok — ${filtered.length} rows, total ${filteredTotal?.value}`,
);

// --- leads.get sub-queries --------------------------------------------------
const [anyLead] = await db
	.select()
	.from(leadTable)
	.where(eq(leadTable.organizationId, org.id))
	.limit(1);

if (!anyLead) {
	console.log("leads.get   skipped — workspace has no leads");
} else {
	const [suppression] = await db
		.select()
		.from(suppressionEntry)
		.where(
			and(
				eq(suppressionEntry.organizationId, org.id),
				eq(suppressionEntry.phoneE164, anyLead.phoneE164),
				or(
					isNull(suppressionEntry.suppressedUntil),
					gt(suppressionEntry.suppressedUntil, new Date()),
				),
			),
		)
		.orderBy(desc(suppressionEntry.createdAt))
		.limit(1);

	const calls = await db
		.select({
			id: callTable.id,
			agentName: agentTable.name,
			summary: callAnalysis.summary,
		})
		.from(callTable)
		.leftJoin(agentTable, eq(callTable.agentId, agentTable.id))
		.leftJoin(callAnalysis, eq(callAnalysis.callId, callTable.id))
		.where(
			and(
				eq(callTable.organizationId, org.id),
				eq(callTable.leadId, anyLead.id),
			),
		)
		.orderBy(desc(callTable.createdAt))
		.limit(25);

	const followUps = await db
		.select({ id: followUpAction.id, agentName: agentTable.name })
		.from(followUpAction)
		.leftJoin(agentTable, eq(followUpAction.agentId, agentTable.id))
		.where(
			and(
				eq(followUpAction.organizationId, org.id),
				eq(followUpAction.leadId, anyLead.id),
			),
		)
		.orderBy(desc(followUpAction.dueAt))
		.limit(25);

	const consentHistory = await db
		.select()
		.from(consentRecord)
		.where(
			and(
				eq(consentRecord.organizationId, org.id),
				eq(consentRecord.leadId, anyLead.id),
			),
		)
		.orderBy(desc(consentRecord.occurredAt))
		.limit(25);

	console.log(
		`leads.get   ok — lead ${anyLead.phoneE164}: ${calls.length} calls, ${followUps.length} follow-ups, ${consentHistory.length} consent records, suppression=${suppression ? suppression.reason : "none"}`,
	);

	// --- leads.remove guard ---------------------------------------------------
	const [called] = await db
		.select({ value: count() })
		.from(callTable)
		.where(
			and(
				eq(callTable.organizationId, org.id),
				eq(callTable.leadId, anyLead.id),
			),
		);
	console.log(
		`leads.remove guard ok — this lead has ${called?.value} calls, so delete would be ${(called?.value ?? 0) > 0 ? "refused" : "allowed"}`,
	);
}

await pgClient.end();
console.log("all queries executed without error");
