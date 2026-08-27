import {
	consentRecord,
	lead as leadTable,
	organizationSettings,
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
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { tenantProcedure } from "../index";
import { invalidateDashboard } from "../lib/cache";

const purposeSchema = z
	.enum(["PROMOTIONAL", "TRANSACTIONAL", "SERVICE"])
	.default("SERVICE");

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
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			await ensureSettings(db, organizationId);

			const rows = await db
				.select()
				.from(leadTable)
				.where(eq(leadTable.organizationId, organizationId))
				.orderBy(desc(leadTable.createdAt))
				.limit(input.limit)
				.offset(input.offset);

			const [totalRow] = await db
				.select({ value: count() })
				.from(leadTable)
				.where(eq(leadTable.organizationId, organizationId));

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
};
