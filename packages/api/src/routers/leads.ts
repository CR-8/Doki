import {
	agent as agentTable,
	callAnalysis,
	call as callTable,
	consentRecord,
	followUpAction,
	lead as leadTable,
	organizationSettings,
	suppressionEntry,
} from "@doki/db/schema";
import {
	type CallPurpose,
	evaluatePolicy,
	loadPolicyContext,
	normalizePhone,
	type PolicyDecision,
	parseLeadCsv,
	recordAudit,
	timezoneForPhone,
} from "@doki/domain";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, gt, ilike, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { tenantProcedure } from "../index";
import { invalidateDashboard } from "../lib/cache";

const purposeSchema = z
	.enum(["PROMOTIONAL", "TRANSACTIONAL", "SERVICE"])
	.default("SERVICE");

const leadStatusSchema = z.enum([
	"NEW",
	"ATTEMPTING_CONTACT",
	"CONTACTED",
	"QUALIFIED",
	"MEETING_BOOKED",
	"NOT_INTERESTED",
	"UNREACHABLE",
	"SUPPRESSED",
]);

const consentSourceSchema = z.enum([
	"WEB_FORM",
	"INBOUND_ENQUIRY",
	"EXISTING_CUSTOMER",
	"IMPORT_ATTESTED",
	"MANUAL_ENTRY",
]);

/** Every purpose a lead could be dialled for, so the UI can show all verdicts. */
const ALL_PURPOSES = ["SERVICE", "PROMOTIONAL", "TRANSACTIONAL"] as const;

/**
 * Reads workspace calling policy, creating defaults on first access so a new
 * workspace is immediately usable. Defaults encode the TCCCPR baseline.
 */
// biome-ignore lint/suspicious/noExplicitAny: drizzle db type is not portable across packages
async function ensureSettings(db: any, organizationId: string) {
	const [existing] = await db
		.select()
		.from(organizationSettings)
		.where(eq(organizationSettings.organizationId, organizationId))
		.limit(1);
	if (existing) return existing;

	await db
		.insert(organizationSettings)
		.values({ organizationId })
		.onConflictDoNothing();

	const [created] = await db
		.select()
		.from(organizationSettings)
		.where(eq(organizationSettings.organizationId, organizationId))
		.limit(1);
	return created;
}

export const leadsRouter = {
	/**
	 * Lists leads with a policy verdict attached to each row.
	 *
	 * Eligibility is evaluated in-process against a context loaded once, so a
	 * page of 50 leads costs a constant number of queries rather than 50x.
	 */
	list: tenantProcedure
		.input(
			z.object({
				limit: z.number().int().min(1).max(100).default(25),
				offset: z.number().int().min(0).default(0),
				purpose: purposeSchema,
				search: z.string().trim().max(120).optional(),
				status: leadStatusSchema.optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			await ensureSettings(db, organizationId);

			// A phone typed as "98765 43210" must still match "+919876543210",
			// so the numeric form is matched on digits alone.
			const term = input.search?.trim();
			const digits = term ? term.replace(/\D/g, "") : "";
			const where = and(
				eq(leadTable.organizationId, organizationId),
				input.status ? eq(leadTable.status, input.status) : undefined,
				term
					? or(
							ilike(leadTable.name, `%${term}%`),
							ilike(leadTable.company, `%${term}%`),
							ilike(leadTable.email, `%${term}%`),
							digits.length >= 3
								? ilike(leadTable.phoneE164, `%${digits}%`)
								: undefined,
						)
					: undefined,
			);

			const rows = await db
				.select()
				.from(leadTable)
				.where(where)
				.orderBy(desc(leadTable.createdAt))
				.limit(input.limit)
				.offset(input.offset);

			const [totalRow] = await db
				.select({ value: count() })
				.from(leadTable)
				.where(where);

			const ctx = await loadPolicyContext(db, {
				organizationId,
				phones: rows.map((r: { phoneE164: string }) => r.phoneE164),
			});

			const leads = rows.map((row: typeof leadTable.$inferSelect) => ({
				...row,
				eligibility: ctx
					? evaluatePolicy(ctx, row, input.purpose as CallPurpose)
					: ({
							allowed: false,
							code: "SETTINGS_MISSING",
							reason: "Workspace calling policy is not configured.",
							retryAt: null,
						} satisfies PolicyDecision),
			}));

			return {
				leads,
				total: totalRow?.value ?? 0,
				capacity: ctx
					? {
							activeCalls: ctx.activeCalls,
							maxConcurrentCalls: ctx.settings.maxConcurrentCalls,
							minutesUsed: Math.round(ctx.monthlyBillableSeconds / 60),
							monthlyMinutesCap: ctx.settings.monthlyMinutesCap,
						}
					: null,
			};
		}),

	/**
	 * Parses a CSV without writing anything, so the user sees exactly what will
	 * happen — including which rows will be rejected and why — before committing.
	 */
	previewImport: tenantProcedure
		.input(z.object({ csv: z.string().min(1).max(5_000_000) }))
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;
			const settings = await ensureSettings(db, organizationId);

			const preview = parseLeadCsv(input.csv, {
				defaultTimezone: settings.defaultTimezone,
			});

			return {
				headers: preview.headers,
				mapping: preview.mapping,
				totalRows: preview.totalRows,
				validCount: preview.valid.length,
				// Only a sample — a 10k-row file must not be echoed back whole.
				sample: preview.valid.slice(0, 10),
				rejected: preview.rejected.slice(0, 50),
				rejectedCount: preview.rejected.length,
				duplicatesInFile: preview.duplicatesInFile.slice(0, 50),
				duplicateCount: preview.duplicatesInFile.length,
			};
		}),

	/**
	 * Commits a parsed CSV.
	 *
	 * `consentAttested` is not decoration. Under TCCCPR the customer must be
	 * able to show how consent was obtained, so importing with consent requires
	 * an explicit attestation plus a source, and every granted lead gets an
	 * append-only consent record naming the user who attested it.
	 */
	commitImport: tenantProcedure
		.input(
			z.object({
				csv: z.string().min(1).max(5_000_000),
				source: z.string().trim().max(120).optional(),
				consentAttested: z.boolean().default(false),
				consentSource: z
					.enum([
						"WEB_FORM",
						"INBOUND_ENQUIRY",
						"EXISTING_CUSTOMER",
						"IMPORT_ATTESTED",
						"MANUAL_ENTRY",
					])
					.optional(),
				consentEvidence: z.string().trim().max(500).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId, user } = context;
			const settings = await ensureSettings(db, organizationId);

			if (input.consentAttested && !input.consentSource) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Attesting consent requires a consent source.",
				});
			}

			const preview = parseLeadCsv(input.csv, {
				defaultTimezone: settings.defaultTimezone,
			});

			if (preview.valid.length === 0) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						preview.rejected[0]?.reason ??
						"No importable rows found in this file.",
				});
			}

			const now = new Date();
			const granted = input.consentAttested;

			const rows = preview.valid.map((lead) => ({
				organizationId,
				name: lead.name,
				company: lead.company,
				email: lead.email,
				phoneRaw: lead.phoneRaw,
				phoneE164: lead.phoneE164,
				phoneCountry: lead.phoneCountry,
				source: lead.source ?? input.source ?? "csv-import",
				timezone: lead.timezone,
				consentStatus: granted ? ("GRANTED" as const) : ("UNKNOWN" as const),
				consentSource: granted ? input.consentSource : null,
				consentAt: granted ? now : null,
				consentEvidence: granted ? (input.consentEvidence ?? null) : null,
				consentAttestedBy: granted ? user.id : null,
			}));

			// Chunked so a large file does not build one enormous statement.
			const CHUNK = 500;
			const inserted: { id: string; phoneE164: string }[] = [];

			for (let i = 0; i < rows.length; i += CHUNK) {
				const batch = rows.slice(i, i + CHUNK);
				const created = await db
					.insert(leadTable)
					.values(batch)
					// A number already in this workspace is skipped, not overwritten:
					// an existing lead may carry consent or opt-out state that a
					// fresh spreadsheet must never silently clobber.
					.onConflictDoNothing({
						target: [leadTable.organizationId, leadTable.phoneE164],
					})
					.returning({ id: leadTable.id, phoneE164: leadTable.phoneE164 });
				inserted.push(...created);
			}

			if (granted && inserted.length > 0) {
				for (let i = 0; i < inserted.length; i += CHUNK) {
					await db.insert(consentRecord).values(
						inserted.slice(i, i + CHUNK).map((row) => ({
							organizationId,
							leadId: row.id,
							phoneE164: row.phoneE164,
							status: "GRANTED" as const,
							source: input.consentSource ?? ("IMPORT_ATTESTED" as const),
							evidence: input.consentEvidence ?? null,
							attestedBy: user.id,
							occurredAt: now,
						})),
					);
				}
			}

			await recordAudit(db, {
				organizationId,
				actor: { type: "USER", id: user.id },
				action: "leads.imported",
				resourceType: "lead",
				metadata: {
					totalRows: preview.totalRows,
					created: inserted.length,
					alreadyExisted: preview.valid.length - inserted.length,
					rejected: preview.rejected.length,
					duplicatesInFile: preview.duplicatesInFile.length,
					consentAttested: granted,
					consentSource: input.consentSource ?? null,
				},
			});

			await invalidateDashboard(organizationId);

			return {
				created: inserted.length,
				alreadyExisted: preview.valid.length - inserted.length,
				rejected: preview.rejected.length,
				duplicatesInFile: preview.duplicatesInFile.length,
				totalRows: preview.totalRows,
			};
		}),

	/** Re-checks one lead. Used by the row action just before dispatching. */
	checkEligibility: tenantProcedure
		.input(z.object({ leadId: z.uuid(), purpose: purposeSchema }))
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			const [lead] = await db
				.select()
				.from(leadTable)
				.where(
					and(
						eq(leadTable.organizationId, organizationId),
						eq(leadTable.id, input.leadId),
					),
				)
				.limit(1);

			if (!lead)
				throw new ORPCError("NOT_FOUND", { message: "Lead not found" });

			const ctx = await loadPolicyContext(db, {
				organizationId,
				phones: [lead.phoneE164],
			});

			if (!ctx) {
				throw new ORPCError("PRECONDITION_FAILED", {
					message: "Workspace calling policy is not configured.",
				});
			}

			return evaluatePolicy(ctx, lead, input.purpose as CallPurpose);
		}),

	/**
	 * Creates a lead. Phone numbers are normalised to E.164 on the way in —
	 * the same value the suppression list is keyed on, so an opted-out number
	 * can never slip back in under a different format.
	 */
	create: tenantProcedure
		.input(
			z.object({
				name: z.string().trim().min(1).max(200).nullish(),
				company: z.string().trim().max(200).nullish(),
				email: z.email().nullish(),
				phone: z.string().trim().min(4).max(32),
				source: z.string().trim().max(120).nullish(),
				consentStatus: z
					.enum(["UNKNOWN", "GRANTED", "REVOKED", "EXPIRED"])
					.default("UNKNOWN"),
				consentSource: z
					.enum([
						"WEB_FORM",
						"INBOUND_ENQUIRY",
						"EXISTING_CUSTOMER",
						"IMPORT_ATTESTED",
						"MANUAL_ENTRY",
					])
					.nullish(),
				consentEvidence: z.string().trim().max(500).nullish(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId, user } = context;

			const phone = normalizePhone(input.phone);
			if (!phone.ok) {
				throw new ORPCError("BAD_REQUEST", { message: phone.reason });
			}

			const settings = await ensureSettings(db, organizationId);
			const timezone = timezoneForPhone(phone.e164, settings.defaultTimezone);

			// Consent without provenance is not consent. If the caller claims
			// GRANTED, record who attested and when.
			const granted = input.consentStatus === "GRANTED";

			const [created] = await db
				.insert(leadTable)
				.values({
					organizationId,
					name: input.name ?? null,
					company: input.company ?? null,
					email: input.email ?? null,
					phoneRaw: input.phone,
					phoneE164: phone.e164,
					phoneCountry: phone.country,
					source: input.source ?? null,
					timezone,
					consentStatus: input.consentStatus,
					consentSource:
						input.consentSource ?? (granted ? "MANUAL_ENTRY" : null),
					consentAt: granted ? new Date() : null,
					consentEvidence: input.consentEvidence ?? null,
					consentAttestedBy: granted ? user.id : null,
				})
				.onConflictDoNothing({
					target: [leadTable.organizationId, leadTable.phoneE164],
				})
				.returning();

			if (!created) {
				throw new ORPCError("CONFLICT", {
					message:
						"A lead with this phone number already exists in this workspace.",
				});
			}

			await invalidateDashboard(organizationId);
			return created;
		}),

	/**
	 * Everything known about one lead, in one round trip.
	 *
	 * The policy verdict is returned for all three purposes rather than the one
	 * currently selected: "blocked for promotional, allowed for service" is the
	 * single most useful thing to know when looking at a lead, and computing it
	 * costs nothing extra once the policy context is loaded.
	 */
	get: tenantProcedure
		.input(z.object({ id: z.uuid() }))
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			const [lead] = await db
				.select()
				.from(leadTable)
				.where(
					and(
						eq(leadTable.organizationId, organizationId),
						eq(leadTable.id, input.id),
					),
				)
				.limit(1);

			if (!lead)
				throw new ORPCError("NOT_FOUND", { message: "Lead not found" });

			const ctx = await loadPolicyContext(db, {
				organizationId,
				phones: [lead.phoneE164],
			});

			const eligibility = Object.fromEntries(
				ALL_PURPOSES.map((purpose) => [
					purpose,
					ctx
						? evaluatePolicy(ctx, lead, purpose as CallPurpose)
						: ({
								allowed: false,
								code: "SETTINGS_MISSING",
								reason: "Workspace calling policy is not configured.",
								retryAt: null,
							} satisfies PolicyDecision),
				]),
			) as Record<(typeof ALL_PURPOSES)[number], PolicyDecision>;

			const [suppression] = await db
				.select()
				.from(suppressionEntry)
				.where(
					and(
						eq(suppressionEntry.organizationId, organizationId),
						eq(suppressionEntry.phoneE164, lead.phoneE164),
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
					status: callTable.status,
					outcome: callTable.outcome,
					purpose: callTable.purpose,
					attempt: callTable.attempt,
					billableSeconds: callTable.billableSeconds,
					totalCostInr: callTable.totalCostInr,
					endedReason: callTable.endedReason,
					createdAt: callTable.createdAt,
					endedAt: callTable.endedAt,
					agentName: agentTable.name,
					summary: callAnalysis.summary,
				})
				.from(callTable)
				.leftJoin(agentTable, eq(callTable.agentId, agentTable.id))
				.leftJoin(callAnalysis, eq(callAnalysis.callId, callTable.id))
				.where(
					and(
						eq(callTable.organizationId, organizationId),
						eq(callTable.leadId, lead.id),
					),
				)
				.orderBy(desc(callTable.createdAt))
				.limit(25);

			const followUps = await db
				.select({
					id: followUpAction.id,
					type: followUpAction.type,
					status: followUpAction.status,
					dueAt: followUpAction.dueAt,
					note: followUpAction.note,
					source: followUpAction.source,
					attempt: followUpAction.attempt,
					maxAttempts: followUpAction.maxAttempts,
					lastError: followUpAction.lastError,
					completedAt: followUpAction.completedAt,
					agentName: agentTable.name,
				})
				.from(followUpAction)
				.leftJoin(agentTable, eq(followUpAction.agentId, agentTable.id))
				.where(
					and(
						eq(followUpAction.organizationId, organizationId),
						eq(followUpAction.leadId, lead.id),
					),
				)
				.orderBy(desc(followUpAction.dueAt))
				.limit(25);

			const consentHistory = await db
				.select()
				.from(consentRecord)
				.where(
					and(
						eq(consentRecord.organizationId, organizationId),
						eq(consentRecord.leadId, lead.id),
					),
				)
				.orderBy(desc(consentRecord.occurredAt))
				.limit(25);

			return {
				lead,
				eligibility,
				suppression: suppression ?? null,
				calls,
				followUps,
				consentHistory,
				capacity: ctx
					? {
							activeCalls: ctx.activeCalls,
							maxConcurrentCalls: ctx.settings.maxConcurrentCalls,
						}
					: null,
			};
		}),

	/**
	 * Edits the descriptive fields of a lead.
	 *
	 * Consent and suppression are deliberately not editable here — they have
	 * their own audited paths. Lifting SUPPRESSED by hand is refused outright:
	 * a number is suppressed because someone asked not to be called, and a
	 * dropdown is not a lawful basis for undoing that.
	 */
	update: tenantProcedure
		.input(
			z.object({
				id: z.uuid(),
				name: z.string().trim().max(200).nullish(),
				company: z.string().trim().max(200).nullish(),
				email: z.union([z.email(), z.literal("")]).nullish(),
				source: z.string().trim().max(120).nullish(),
				timezone: z.string().trim().min(1).max(64).optional(),
				status: leadStatusSchema.optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId, user } = context;
			const { id, ...rest } = input;

			const [existing] = await db
				.select()
				.from(leadTable)
				.where(
					and(
						eq(leadTable.organizationId, organizationId),
						eq(leadTable.id, id),
					),
				)
				.limit(1);

			if (!existing)
				throw new ORPCError("NOT_FOUND", { message: "Lead not found" });

			if (rest.status === "SUPPRESSED" && existing.status !== "SUPPRESSED") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Use the opt-out action so the suppression is recorded.",
				});
			}

			if (existing.status === "SUPPRESSED" && rest.status !== undefined) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"This lead is suppressed. Its status cannot be changed by hand.",
				});
			}

			const patch: Record<string, unknown> = Object.fromEntries(
				Object.entries(rest).filter(([, value]) => value !== undefined),
			);
			// An empty email box means "clear it", not "store an empty string".
			if (patch.email === "") patch.email = null;

			if (Object.keys(patch).length === 0) return existing;

			const [updated] = await db
				.update(leadTable)
				.set(patch)
				.where(
					and(
						eq(leadTable.organizationId, organizationId),
						eq(leadTable.id, id),
					),
				)
				.returning();

			await recordAudit(db, {
				organizationId,
				actor: { type: "USER", id: user.id },
				action: "lead.updated",
				resourceType: "lead",
				resourceId: id,
				metadata: { changed: Object.keys(patch) },
			});

			await invalidateDashboard(organizationId);
			return updated;
		}),

	/**
	 * Records a consent change with provenance.
	 *
	 * Writes an append-only consent record alongside the lead update, because
	 * the current value alone cannot answer "how did you obtain consent, and
	 * when?" — which is exactly what a TCCCPR complaint asks.
	 */
	setConsent: tenantProcedure
		.input(
			z.object({
				leadId: z.uuid(),
				status: z.enum(["UNKNOWN", "GRANTED", "REVOKED", "EXPIRED"]),
				source: consentSourceSchema.optional(),
				evidence: z.string().trim().max(500).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId, user } = context;

			if (input.status === "GRANTED" && !input.source) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Granting consent requires a source.",
				});
			}

			const [lead] = await db
				.select()
				.from(leadTable)
				.where(
					and(
						eq(leadTable.organizationId, organizationId),
						eq(leadTable.id, input.leadId),
					),
				)
				.limit(1);

			if (!lead)
				throw new ORPCError("NOT_FOUND", { message: "Lead not found" });

			const now = new Date();
			const granted = input.status === "GRANTED";

			const [updated] = await db
				.update(leadTable)
				.set({
					consentStatus: input.status,
					consentSource: input.source ?? (granted ? "MANUAL_ENTRY" : null),
					consentAt: granted ? now : null,
					consentEvidence: input.evidence ?? null,
					consentAttestedBy: granted ? user.id : null,
				})
				.where(eq(leadTable.id, lead.id))
				.returning();

			// Append-only: the lead row holds the current value, this holds the trail.
			await db.insert(consentRecord).values({
				organizationId,
				leadId: lead.id,
				phoneE164: lead.phoneE164,
				status: input.status,
				source: input.source ?? "MANUAL_ENTRY",
				evidence: input.evidence ?? null,
				attestedBy: user.id,
				occurredAt: now,
			});

			await recordAudit(db, {
				organizationId,
				actor: { type: "USER", id: user.id },
				action: "lead.consent_changed",
				resourceType: "lead",
				resourceId: lead.id,
				metadata: {
					from: lead.consentStatus,
					to: input.status,
					source: input.source ?? null,
				},
			});

			await invalidateDashboard(organizationId);
			return updated;
		}),

	/**
	 * Deletes a lead that should never have been imported.
	 *
	 * Refused once the lead has been called: the call is a regulated record, and
	 * deleting the person it was placed to would leave an unexplainable row in
	 * the audit trail. Those leads get suppressed instead.
	 */
	remove: tenantProcedure
		.input(z.object({ id: z.uuid() }))
		.handler(async ({ context, input }) => {
			const { db, organizationId, user } = context;

			const [lead] = await db
				.select()
				.from(leadTable)
				.where(
					and(
						eq(leadTable.organizationId, organizationId),
						eq(leadTable.id, input.id),
					),
				)
				.limit(1);

			if (!lead)
				throw new ORPCError("NOT_FOUND", { message: "Lead not found" });

			const [called] = await db
				.select({ value: count() })
				.from(callTable)
				.where(
					and(
						eq(callTable.organizationId, organizationId),
						eq(callTable.leadId, lead.id),
					),
				);

			if ((called?.value ?? 0) > 0) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"This lead has call history and cannot be deleted. Opt it out instead.",
				});
			}

			await db.delete(leadTable).where(eq(leadTable.id, lead.id));

			await recordAudit(db, {
				organizationId,
				actor: { type: "USER", id: user.id },
				action: "lead.deleted",
				resourceType: "lead",
				resourceId: lead.id,
				metadata: { phoneE164: lead.phoneE164, name: lead.name },
			});

			await invalidateDashboard(organizationId);
			return { ok: true as const };
		}),
};
