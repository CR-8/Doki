import { relations, sql } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { consentSourceEnum, consentStatusEnum, leadStatusEnum } from "./enums";
import { organization } from "./tenant";

export const lead = pgTable(
	"lead",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),

		name: text("name"),
		company: text("company"),
		email: text("email"),

		/** Exactly as supplied by the customer, kept for audit and debugging. */
		phoneRaw: text("phone_raw").notNull(),
		/** Normalised E.164, e.g. +919876543210. All dialling uses this. */
		phoneE164: text("phone_e164").notNull(),
		phoneCountry: text("phone_country").default("IN").notNull(),

		status: leadStatusEnum("status").default("NEW").notNull(),
		/** Free-text provenance: "website-form", "meta-ads", "csv:jan-batch". */
		source: text("source"),
		/** Customer's own record id — makes re-imports idempotent. */
		externalId: text("external_id"),

		ownerId: text("owner_id").references(() => user.id, {
			onDelete: "set null",
		}),

		/** IANA zone. Drives the calling-window check. */
		timezone: text("timezone").default("Asia/Kolkata").notNull(),

		// ---- Consent provenance (TCCCPR) ------------------------------------
		// A boolean is not defensible. We must be able to show HOW and WHEN
		// consent was obtained, and who attested to it.
		consentStatus: consentStatusEnum("consent_status")
			.default("UNKNOWN")
			.notNull(),
		consentSource: consentSourceEnum("consent_source"),
		consentAt: timestamp("consent_at"),
		/** URL, form id, recording ref, or signed attestation reference. */
		consentEvidence: text("consent_evidence"),
		/** User who attested consent at import time. */
		consentAttestedBy: text("consent_attested_by").references(() => user.id, {
			onDelete: "set null",
		}),

		// ---- Attempt policy --------------------------------------------------
		attemptCount: integer("attempt_count").default(0).notNull(),
		lastAttemptAt: timestamp("last_attempt_at"),
		/** Deterministic gate: no dial before this instant. */
		nextEligibleAt: timestamp("next_eligible_at"),

		customFields: jsonb("custom_fields")
			.$type<Record<string, unknown>>()
			.default({})
			.notNull(),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		// One lead per phone number per tenant — makes CSV re-import safe.
		uniqueIndex("lead_org_phone_uidx").on(
			table.organizationId,
			table.phoneE164,
		),
		uniqueIndex("lead_org_external_uidx")
			.on(table.organizationId, table.externalId)
			.where(sql`${table.externalId} is not null`),
		index("lead_org_status_idx").on(table.organizationId, table.status),
		index("lead_org_eligible_idx").on(
			table.organizationId,
			table.nextEligibleAt,
		),
	],
);

export const leadRelations = relations(lead, ({ one }) => ({
	organization: one(organization, {
		fields: [lead.organizationId],
		references: [organization.id],
	}),
	owner: one(user, { fields: [lead.ownerId], references: [user.id] }),
}));

export type Lead = typeof lead.$inferSelect;
export type NewLead = typeof lead.$inferInsert;
