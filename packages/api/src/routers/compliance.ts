import {
	auditEvent,
	consentRecord,
	dndRegistryCache,
	lead as leadTable,
	suppressionEntry,
	user as userTable,
} from "@doki/db/schema";
import { normalizePhone, recordAudit } from "@doki/domain";
import { ORPCError } from "@orpc/server";
import {
	and,
	count,
	desc,
	eq,
	gt,
	ilike,
	inArray,
	lte,
	or,
	sql,
} from "drizzle-orm";
import { z } from "zod";

import { tenantProcedure } from "../index";
import { invalidateDashboard } from "../lib/cache";

/** Shape of an audit row, so spreading it keeps every column typed. */
type AuditRow = {
	id: string;
	actorType: string;
	actorId: string | null;
	action: string;
	resourceType: string;
	resourceId: string | null;
	reason: string | null;
	metadata: Record<string, unknown>;
	createdAt: Date;
};

const reasonSchema = z.enum([
	"USER_OPT_OUT",
	"DND_REGISTRY",
	"WRONG_NUMBER",
	"COMPLAINT",
	"MANUAL",
	"BOUNCED",
]);

/**
 * Compliance surface.
 *
 * Everything here exists because TCCCPR questions are answered with records,
 * not assurances: which numbers are blocked and why, how consent was obtained,
 * and what the system did on its own. The tables were always written to — this
 * router is what makes them readable.
 */
export const complianceRouter = {
	/** Header counts for the compliance screen. */
	overview: tenantProcedure.handler(async ({ context }) => {
		const { db, organizationId } = context;
		const now = new Date();
		const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

		const [suppression] = await db
			.select({
				total: count(),
				permanent: sql<number>`cast(count(*) filter (where ${suppressionEntry.suppressedUntil} is null) as int)`,
				optOuts: sql<number>`cast(count(*) filter (where ${suppressionEntry.reason} = 'USER_OPT_OUT') as int)`,
				expiring: sql<number>`cast(count(*) filter (where ${suppressionEntry.suppressedUntil} is not null and ${suppressionEntry.suppressedUntil} > now()) as int)`,
			})
			.from(suppressionEntry)
			.where(eq(suppressionEntry.organizationId, organizationId));

		const [consent] = await db
			.select({
				total: count(),
				granted: sql<number>`cast(count(*) filter (where ${consentRecord.status} = 'GRANTED') as int)`,
				revoked: sql<number>`cast(count(*) filter (where ${consentRecord.status} = 'REVOKED') as int)`,
			})
			.from(consentRecord)
			.where(eq(consentRecord.organizationId, organizationId));

		const [audit] = await db
			.select({
				total: count(),
				lastWeek: sql<number>`cast(count(*) filter (where ${auditEvent.createdAt} >= ${weekAgo}) as int)`,
			})
			.from(auditEvent)
			.where(eq(auditEvent.organizationId, organizationId));

		// Scoped to numbers this workspace actually holds — the cache itself is
		// national and shared, so a global count would be meaningless here.
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
					eq(leadTable.organizationId, organizationId),
				),
			);

		const [leads] = await db
			.select({
				total: count(),
				withConsent: sql<number>`cast(count(*) filter (where ${leadTable.consentStatus} = 'GRANTED') as int)`,
			})
			.from(leadTable)
			.where(eq(leadTable.organizationId, organizationId));

		return {
			suppression: {
				total: suppression?.total ?? 0,
				permanent: suppression?.permanent ?? 0,
				optOuts: suppression?.optOuts ?? 0,
				expiring: suppression?.expiring ?? 0,
			},
			consent: {
				records: consent?.total ?? 0,
				granted: consent?.granted ?? 0,
				revoked: consent?.revoked ?? 0,
				leadsWithConsent: leads?.withConsent ?? 0,
				leadsTotal: leads?.total ?? 0,
			},
			audit: { total: audit?.total ?? 0, lastWeek: audit?.lastWeek ?? 0 },
			dnd: {
				checked: dnd?.checked ?? 0,
				registered: dnd?.registered ?? 0,
				stale: dnd?.stale ?? 0,
			},
		};
	}),

	/** The do-not-call list, with the lead each number belongs to when there is one. */
	listSuppressions: tenantProcedure
		.input(
			z.object({
				limit: z.number().int().min(1).max(200).default(50),
				offset: z.number().int().min(0).default(0),
				search: z.string().trim().max(64).optional(),
				reason: reasonSchema.optional(),
				/** Hide entries whose freeze has already elapsed. */
				activeOnly: z.boolean().default(false),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			const digits = input.search ? input.search.replace(/\D/g, "") : "";
			const where = and(
				eq(suppressionEntry.organizationId, organizationId),
				input.reason ? eq(suppressionEntry.reason, input.reason) : undefined,
				input.activeOnly
					? or(
							sql`${suppressionEntry.suppressedUntil} is null`,
							gt(suppressionEntry.suppressedUntil, new Date()),
						)
					: undefined,
				digits.length >= 3
					? ilike(suppressionEntry.phoneE164, `%${digits}%`)
					: undefined,
			);

			const rows = await db
				.select({
					id: suppressionEntry.id,
					phoneE164: suppressionEntry.phoneE164,
					reason: suppressionEntry.reason,
					notes: suppressionEntry.notes,
					suppressedUntil: suppressionEntry.suppressedUntil,
					createdAt: suppressionEntry.createdAt,
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
						eq(leadTable.organizationId, organizationId),
					),
				)
				.where(where)
				.orderBy(desc(suppressionEntry.createdAt))
				.limit(input.limit)
				.offset(input.offset);

			const [totalRow] = await db
				.select({ value: count() })
				.from(suppressionEntry)
				.where(where);

			return { entries: rows, total: totalRow?.value ?? 0 };
		}),

	/**
	 * Blocks a number by hand.
	 *
	 * Also flips any lead holding that number, because a suppression the leads
	 * list does not reflect is a suppression someone will try to dial past.
	 */
	addSuppression: tenantProcedure
		.input(
			z.object({
				phone: z.string().trim().min(4).max(32),
				reason: reasonSchema.default("MANUAL"),
				notes: z.string().trim().max(300).optional(),
				/** Null/omitted means permanent. */
				freezeDays: z.number().int().min(1).max(3650).nullish(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId, user } = context;

			const phone = normalizePhone(input.phone);
			if (!phone.ok) {
				throw new ORPCError("BAD_REQUEST", { message: phone.reason });
			}

			const suppressedUntil = input.freezeDays
				? new Date(Date.now() + input.freezeDays * 24 * 3600 * 1000)
				: null;

			const [entry] = await db
				.insert(suppressionEntry)
				.values({
					organizationId,
					phoneE164: phone.e164,
					reason: input.reason,
					notes: input.notes ?? null,
					suppressedUntil,
					createdBy: user.id,
				})
				.onConflictDoUpdate({
					target: [suppressionEntry.organizationId, suppressionEntry.phoneE164],
					set: {
						reason: input.reason,
						notes: input.notes ?? null,
						suppressedUntil,
						createdBy: user.id,
					},
				})
				.returning();

			await db
				.update(leadTable)
				.set({ status: "SUPPRESSED" })
				.where(
					and(
						eq(leadTable.organizationId, organizationId),
						eq(leadTable.phoneE164, phone.e164),
					),
				);

			await recordAudit(db, {
				organizationId,
				actor: { type: "USER", id: user.id },
				action: "suppression.added",
				resourceType: "suppression_entry",
				resourceId: entry?.id,
				reason: input.notes,
				metadata: {
					phoneE164: phone.e164,
					reason: input.reason,
					suppressedUntil: suppressedUntil?.toISOString() ?? null,
				},
			});

			await invalidateDashboard(organizationId);
			return entry;
		}),

	/**
	 * Lifts a suppression.
	 *
	 * Lifting a consumer opt-out before its freeze expires is possible but
	 * deliberately awkward: it needs an explicit acknowledgement on top of the
	 * written reason, and it is recorded as an early lift.
	 *
	 * An absolute block was the wrong instinct. The operator owns this data and
	 * carries the regulatory risk, and a button that simply refuses does not
	 * stop anyone — it pushes them to edit the database directly, which leaves
	 * no trace at all. A gate that records who overrode it, when, and why is
	 * worth more than one that cannot be opened.
	 */
	liftSuppression: tenantProcedure
		.input(
			z.object({
				id: z.uuid(),
				reason: z.string().trim().min(3).max(300),
				/**
				 * Required to lift a consumer opt-out early. The caller is stating
				 * they have a lawful basis — fresh consent, or the entry was
				 * recorded in error.
				 */
				acknowledgeOptOut: z.boolean().default(false),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId, user } = context;

			const [entry] = await db
				.select()
				.from(suppressionEntry)
				.where(
					and(
						eq(suppressionEntry.organizationId, organizationId),
						eq(suppressionEntry.id, input.id),
					),
				)
				.limit(1);

			if (!entry)
				throw new ORPCError("NOT_FOUND", { message: "Entry not found" });

			const stillFrozen =
				entry.suppressedUntil === null || entry.suppressedUntil > new Date();
			const earlyOptOutLift = entry.reason === "USER_OPT_OUT" && stillFrozen;

			// The acknowledgement is the whole safeguard: it cannot be reached by
			// a stray click, and refusing without it keeps the override deliberate.
			if (earlyOptOutLift && !input.acknowledgeOptOut) {
				throw new ORPCError("BAD_REQUEST", {
					message: entry.suppressedUntil
						? `This person opted out and the freeze runs until ${entry.suppressedUntil.toISOString().slice(0, 10)}. Confirm you have a lawful basis to call them again before lifting it.`
						: "This person opted out with no expiry. Confirm you have a lawful basis to call them again before lifting it.",
				});
			}

			await db
				.delete(suppressionEntry)
				.where(eq(suppressionEntry.id, entry.id));

			// Restore the lead to a callable state. The prior status is not
			// recoverable, so derive it: anyone already dialled is CONTACTED,
			// anyone never dialled goes back to NEW.
			await db
				.update(leadTable)
				.set({
					status: sql`case when ${leadTable.attemptCount} > 0 then 'CONTACTED'::lead_status else 'NEW'::lead_status end`,
				})
				.where(
					and(
						eq(leadTable.organizationId, organizationId),
						eq(leadTable.phoneE164, entry.phoneE164),
						eq(leadTable.status, "SUPPRESSED"),
					),
				);

			await recordAudit(db, {
				organizationId,
				actor: { type: "USER", id: user.id },
				// A distinct verb, so an early override is findable in the audit
				// log without reading the metadata of every ordinary lift.
				action: earlyOptOutLift
					? "suppression.lifted_early"
					: "suppression.lifted",
				resourceType: "suppression_entry",
				resourceId: entry.id,
				reason: input.reason,
				metadata: {
					phoneE164: entry.phoneE164,
					originalReason: entry.reason,
					earlyLift: earlyOptOutLift,
					freezeRanUntil: entry.suppressedUntil?.toISOString() ?? null,
					daysRemaining: entry.suppressedUntil
						? Math.max(
								0,
								Math.ceil(
									(entry.suppressedUntil.getTime() - Date.now()) / 86_400_000,
								),
							)
						: null,
				},
			});

			await invalidateDashboard(organizationId);
			return { ok: true as const, earlyLift: earlyOptOutLift };
		}),

	/** The workspace-wide consent trail. */
	listConsents: tenantProcedure
		.input(
			z.object({
				limit: z.number().int().min(1).max(200).default(50),
				offset: z.number().int().min(0).default(0),
				search: z.string().trim().max(64).optional(),
				status: z.enum(["UNKNOWN", "GRANTED", "REVOKED", "EXPIRED"]).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			const digits = input.search ? input.search.replace(/\D/g, "") : "";
			const where = and(
				eq(consentRecord.organizationId, organizationId),
				input.status ? eq(consentRecord.status, input.status) : undefined,
				digits.length >= 3
					? ilike(consentRecord.phoneE164, `%${digits}%`)
					: undefined,
			);

			const rows = await db
				.select({
					id: consentRecord.id,
					phoneE164: consentRecord.phoneE164,
					status: consentRecord.status,
					source: consentRecord.source,
					evidence: consentRecord.evidence,
					occurredAt: consentRecord.occurredAt,
					leadId: consentRecord.leadId,
					leadName: leadTable.name,
					attestedByName: userTable.name,
				})
				.from(consentRecord)
				.leftJoin(leadTable, eq(consentRecord.leadId, leadTable.id))
				.leftJoin(userTable, eq(consentRecord.attestedBy, userTable.id))
				.where(where)
				.orderBy(desc(consentRecord.occurredAt))
				.limit(input.limit)
				.offset(input.offset);

			const [totalRow] = await db
				.select({ value: count() })
				.from(consentRecord)
				.where(where);

			return { records: rows, total: totalRow?.value ?? 0 };
		}),

	/** Everything the system did, and why. */
	listAudit: tenantProcedure
		.input(
			z.object({
				limit: z.number().int().min(1).max(200).default(50),
				offset: z.number().int().min(0).default(0),
				actorType: z.enum(["USER", "SYSTEM", "AI", "PROVIDER"]).optional(),
				action: z.string().trim().max(64).optional(),
				resourceId: z.string().trim().max(64).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			const where = and(
				eq(auditEvent.organizationId, organizationId),
				input.actorType ? eq(auditEvent.actorType, input.actorType) : undefined,
				// Prefix match, so "call." selects every call verb at once.
				input.action ? ilike(auditEvent.action, `${input.action}%`) : undefined,
				input.resourceId
					? eq(auditEvent.resourceId, input.resourceId)
					: undefined,
			);

			const rows = (await db
				.select({
					id: auditEvent.id,
					actorType: auditEvent.actorType,
					actorId: auditEvent.actorId,
					action: auditEvent.action,
					resourceType: auditEvent.resourceType,
					resourceId: auditEvent.resourceId,
					reason: auditEvent.reason,
					metadata: auditEvent.metadata,
					createdAt: auditEvent.createdAt,
				})
				.from(auditEvent)
				.where(where)
				.orderBy(desc(auditEvent.createdAt))
				.limit(input.limit)
				.offset(input.offset)) as AuditRow[];

			const [totalRow] = await db
				.select({ value: count() })
				.from(auditEvent)
				.where(where);

			// Resolve user actors in one query rather than a join per row — most
			// events are SYSTEM or AI and have no user to look up at all.
			const userIds = [
				...new Set(
					rows
						.filter((row) => row.actorType === "USER" && row.actorId)
						.map((row) => row.actorId as string),
				),
			];

			const actors = userIds.length
				? await db
						.select({ id: userTable.id, name: userTable.name })
						.from(userTable)
						.where(inArray(userTable.id, userIds))
				: [];

			const nameById = new Map(
				actors.map((a: { id: string; name: string }) => [a.id, a.name]),
			);

			return {
				events: rows.map((row) => ({
					...row,
					actorName:
						row.actorType === "USER" && row.actorId
							? (nameById.get(row.actorId) ?? null)
							: null,
				})),
				total: totalRow?.value ?? 0,
			};
		}),

	/**
	 * The whole suppression list, for handing to a regulator or a client.
	 *
	 * Deliberately uncapped and unpaginated: a partial do-not-call list is worse
	 * than none, because it reads as complete.
	 */
	exportSuppressions: tenantProcedure.handler(async ({ context }) => {
		const { db, organizationId, user } = context;

		const rows = await db
			.select({
				phoneE164: suppressionEntry.phoneE164,
				reason: suppressionEntry.reason,
				notes: suppressionEntry.notes,
				suppressedUntil: suppressionEntry.suppressedUntil,
				createdAt: suppressionEntry.createdAt,
			})
			.from(suppressionEntry)
			.where(eq(suppressionEntry.organizationId, organizationId))
			.orderBy(desc(suppressionEntry.createdAt));

		await recordAudit(db, {
			organizationId,
			actor: { type: "USER", id: user.id },
			action: "suppression.exported",
			resourceType: "suppression_entry",
			metadata: { rows: rows.length },
		});

		return { rows, generatedAt: new Date() };
	}),

	/**
	 * Numbers whose DND scrub has gone stale.
	 *
	 * The policy engine fails closed on these, so they are the reason a
	 * promotional call gets refused for no visible cause.
	 */
	staleScrubs: tenantProcedure
		.input(z.object({ limit: z.number().int().min(1).max(100).default(25) }))
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			const rows = await db
				.select({
					phoneE164: dndRegistryCache.phoneE164,
					isRegistered: dndRegistryCache.isRegistered,
					checkedAt: dndRegistryCache.checkedAt,
					expiresAt: dndRegistryCache.expiresAt,
					leadName: leadTable.name,
					leadId: leadTable.id,
				})
				.from(dndRegistryCache)
				.innerJoin(
					leadTable,
					and(
						eq(leadTable.phoneE164, dndRegistryCache.phoneE164),
						eq(leadTable.organizationId, organizationId),
					),
				)
				.where(lte(dndRegistryCache.expiresAt, new Date()))
				.orderBy(desc(dndRegistryCache.expiresAt))
				.limit(input.limit);

			return { entries: rows };
		}),
};
