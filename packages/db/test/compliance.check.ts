import dotenv from "dotenv";

dotenv.config({ path: "../../apps/web/.env" });

const { and, count, desc, eq, gt, ilike, inArray, lte, or, sql } = await import(
	"drizzle-orm"
);
const { db, pgClient } = await import("../src/index");
const schema = await import("../src/schema");

const {
	auditEvent,
	consentRecord,
	dndRegistryCache,
	lead: leadTable,
	organization,
	suppressionEntry,
	user: userTable,
} = schema;

const [org] = await db
	.select({ id: organization.id, name: organization.name })
	.from(organization)
	.limit(1);

if (!org) {
	console.log("no workspace — nothing to exercise");
	await pgClient.end();
	process.exit(0);
}

console.log(`workspace: ${org.name}`);

// --- compliance.overview ----------------------------------------------------
const [suppression] = await db
	.select({
		total: count(),
		permanent: sql<number>`cast(count(*) filter (where ${suppressionEntry.suppressedUntil} is null) as int)`,
		optOuts: sql<number>`cast(count(*) filter (where ${suppressionEntry.reason} = 'USER_OPT_OUT') as int)`,
	})
	.from(suppressionEntry)
	.where(eq(suppressionEntry.organizationId, org.id));

const [dnd] = await db
	.select({
		checked: count(),
		registered: sql<number>`cast(count(*) filter (where ${dndRegistryCache.isRegistered}) as int)`,
		stale: sql<number>`cast(count(*) filter (where ${dndRegistryCache.expiresAt} <= now()) as int)`,
	})
	.from(dndRegistryCache)
	.innerJoin(
		leadTable,
		and(
			eq(leadTable.phoneE164, dndRegistryCache.phoneE164),
			eq(leadTable.organizationId, org.id),
		),
	);

console.log(
	`overview           ok — ${suppression?.total} blocked (${suppression?.optOuts} opt-outs, ${suppression?.permanent} permanent), ${dnd?.checked} scrubbed (${dnd?.stale} stale)`,
);

// --- compliance.listSuppressions --------------------------------------------
const supWhere = and(
	eq(suppressionEntry.organizationId, org.id),
	or(
		sql`${suppressionEntry.suppressedUntil} is null`,
		gt(suppressionEntry.suppressedUntil, new Date()),
	),
	ilike(suppressionEntry.phoneE164, "%9%"),
);
const entries = await db
	.select({
		id: suppressionEntry.id,
		phoneE164: suppressionEntry.phoneE164,
		reason: suppressionEntry.reason,
		createdByName: userTable.name,
		leadId: leadTable.id,
		leadName: leadTable.name,
	})
	.from(suppressionEntry)
	.leftJoin(userTable, eq(suppressionEntry.createdBy, userTable.id))
	.leftJoin(
		leadTable,
		and(
			eq(leadTable.phoneE164, suppressionEntry.phoneE164),
			eq(leadTable.organizationId, org.id),
		),
	)
	.where(supWhere)
	.orderBy(desc(suppressionEntry.createdAt))
	.limit(50);
console.log(
	`listSuppressions   ok — ${entries.length} active entries matching a digit filter`,
);

// --- compliance.listConsents ------------------------------------------------
const consents = await db
	.select({
		id: consentRecord.id,
		phoneE164: consentRecord.phoneE164,
		status: consentRecord.status,
		leadName: leadTable.name,
		attestedByName: userTable.name,
	})
	.from(consentRecord)
	.leftJoin(leadTable, eq(consentRecord.leadId, leadTable.id))
	.leftJoin(userTable, eq(consentRecord.attestedBy, userTable.id))
	.where(eq(consentRecord.organizationId, org.id))
	.orderBy(desc(consentRecord.occurredAt))
	.limit(50);
console.log(`listConsents       ok — ${consents.length} consent records`);

// --- compliance.listAudit ---------------------------------------------------
const events = await db
	.select({
		id: auditEvent.id,
		actorType: auditEvent.actorType,
		actorId: auditEvent.actorId,
		action: auditEvent.action,
		resourceType: auditEvent.resourceType,
		resourceId: auditEvent.resourceId,
		metadata: auditEvent.metadata,
		createdAt: auditEvent.createdAt,
	})
	.from(auditEvent)
	.where(
		and(
			eq(auditEvent.organizationId, org.id),
			ilike(auditEvent.action, "call%"),
		),
	)
	.orderBy(desc(auditEvent.createdAt))
	.limit(50);

const userIds = [
	...new Set(
		events
			.filter(
				(e: { actorType: string; actorId: string | null }) =>
					e.actorType === "USER" && e.actorId,
			)
			.map((e: { actorId: string | null }) => e.actorId as string),
	),
] as string[];

const actors = userIds.length
	? await db
			.select({ id: userTable.id, name: userTable.name })
			.from(userTable)
			.where(inArray(userTable.id, userIds))
	: [];

console.log(
	`listAudit          ok — ${events.length} "call*" events, ${actors.length} distinct user actors resolved`,
);

// --- compliance.staleScrubs -------------------------------------------------
const staleRows = await db
	.select({ phoneE164: dndRegistryCache.phoneE164, leadId: leadTable.id })
	.from(dndRegistryCache)
	.innerJoin(
		leadTable,
		and(
			eq(leadTable.phoneE164, dndRegistryCache.phoneE164),
			eq(leadTable.organizationId, org.id),
		),
	)
	.where(lte(dndRegistryCache.expiresAt, new Date()))
	.limit(25);
console.log(`staleScrubs        ok — ${staleRows.length} stale scrubs`);

// --- add + lift, rolled back ------------------------------------------------
const ROLLBACK = "rollback-sentinel";
const PROBE_PHONE = "+919999000011";

try {
	// biome-ignore lint/suspicious/noExplicitAny: transaction handle
	await db.transaction(async (tx: any) => {
		const [entry] = await tx
			.insert(suppressionEntry)
			.values({
				organizationId: org.id,
				phoneE164: PROBE_PHONE,
				reason: "MANUAL" as const,
				notes: "probe",
				suppressedUntil: null,
			})
			.onConflictDoUpdate({
				target: [suppressionEntry.organizationId, suppressionEntry.phoneE164],
				set: { reason: "MANUAL" as const, notes: "probe" },
			})
			.returning();
		console.log(
			`addSuppression     ok — upsert returned ${entry.phoneE164} (${entry.reason})`,
		);

		// Suppress a real lead so the restore below actually has a row to act
		// on — a case expression that never executes proves nothing.
		const [victim] = await tx
			.select({ id: leadTable.id, attemptCount: leadTable.attemptCount })
			.from(leadTable)
			.where(eq(leadTable.organizationId, org.id))
			.limit(1);

		if (victim) {
			await tx
				.update(leadTable)
				.set({ status: "SUPPRESSED" as const })
				.where(eq(leadTable.id, victim.id));
		}

		await tx.delete(suppressionEntry).where(eq(suppressionEntry.id, entry.id));

		// The enum cast is the part worth proving — a bare string here fails.
		const restored = await tx
			.update(leadTable)
			.set({
				status: sql`case when ${leadTable.attemptCount} > 0 then 'CONTACTED'::lead_status else 'NEW'::lead_status end`,
			})
			.where(
				and(
					eq(leadTable.organizationId, org.id),
					eq(leadTable.status, "SUPPRESSED"),
				),
			)
			.returning({ id: leadTable.id, status: leadTable.status });
		console.log(
			`liftSuppression    ok — enum cast applied, ${restored.length} lead(s) restored to ${restored.map((r: { status: string }) => r.status).join(", ") || "n/a"} (lead had ${victim?.attemptCount ?? 0} attempts)`,
		);

		throw new Error(ROLLBACK);
	});
} catch (error) {
	if ((error as Error).message !== ROLLBACK) throw error;
	console.log("rolled back — no changes persisted");
}

const [leftover] = await db
	.select({ value: count() })
	.from(suppressionEntry)
	.where(
		and(
			eq(suppressionEntry.organizationId, org.id),
			eq(suppressionEntry.phoneE164, PROBE_PHONE),
		),
	);
console.log(`verified: ${leftover?.value} probe entries remain (expected 0)`);

await pgClient.end();
