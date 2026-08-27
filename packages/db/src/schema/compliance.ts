import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import {
	consentSourceEnum,
	consentStatusEnum,
	suppressionReasonEnum,
} from "./enums";
import { lead } from "./leads";
import { organization } from "./tenant";

/**
 * Do-not-call list. Checked before EVERY dial, with no exceptions and no
 * prompt involvement. An opt-out heard on a call writes here synchronously
 * before the call record is even finalised.
 */
export const suppressionEntry = pgTable(
	"suppression_entry",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),

		phoneE164: text("phone_e164").notNull(),
		reason: suppressionReasonEnum("reason").notNull(),
		notes: text("notes"),

		/**
		 * NULL means permanent. Otherwise the number becomes callable again only
		 * after this instant — used for the 90-day post-opt-out freeze.
		 */
		suppressedUntil: timestamp("suppressed_until"),

		createdBy: text("created_by").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("suppression_org_phone_uidx").on(
			table.organizationId,
			table.phoneE164,
		),
		index("suppression_org_idx").on(table.organizationId),
	],
);

/**
 * National DND / NCPR scrub results. The registry is national, so this cache
 * is shared rather than tenant-scoped — it holds no customer data, only the
 * public preference status of a number.
 */
export const dndRegistryCache = pgTable(
	"dnd_registry_cache",
	{
		phoneE164: text("phone_e164").primaryKey(),
		/** True = registered on DND, must not receive promotional calls. */
		isRegistered: boolean("is_registered").notNull(),
		/** Preference categories the subscriber has blocked, if supplied. */
		categories: jsonb("categories").$type<string[]>().default([]).notNull(),
		checkedAt: timestamp("checked_at").defaultNow().notNull(),
		/** Re-scrub after this instant; stale results must not be trusted. */
		expiresAt: timestamp("expires_at").notNull(),
	},
	(table) => [index("dnd_expires_idx").on(table.expiresAt)],
);

/**
 * Append-only consent history. `lead.consent*` holds the current value;
 * this table proves how it got there. Never updated, only inserted.
 */
export const consentRecord = pgTable(
	"consent_record",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		leadId: uuid("lead_id").references(() => lead.id, { onDelete: "set null" }),

		phoneE164: text("phone_e164").notNull(),
		status: consentStatusEnum("status").notNull(),
		source: consentSourceEnum("source").notNull(),
		evidence: text("evidence"),

		attestedBy: text("attested_by").references(() => user.id, {
			onDelete: "set null",
		}),
		occurredAt: timestamp("occurred_at").defaultNow().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("consent_org_phone_idx").on(table.organizationId, table.phoneE164),
		index("consent_lead_idx").on(table.leadId),
	],
);

/**
 * Audit trail. Every autonomous action the system takes lands here, so any
 * customer question is answerable: who or what did this, when, and why.
 */
export const auditEvent = pgTable(
	"audit_event",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),

		/** "USER" | "SYSTEM" | "AI" | "PROVIDER" */
		actorType: text("actor_type").notNull(),
		actorId: text("actor_id"),

		/** Verb, e.g. "call.dispatched", "lead.suppressed", "consent.revoked". */
		action: text("action").notNull(),
		resourceType: text("resource_type").notNull(),
		resourceId: text("resource_id"),

		/** Why a deterministic gate allowed or refused something. */
		reason: text("reason"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.default({})
			.notNull(),

		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("audit_org_created_idx").on(table.organizationId, table.createdAt),
		index("audit_resource_idx").on(table.resourceType, table.resourceId),
	],
);

export const suppressionEntryRelations = relations(
	suppressionEntry,
	({ one }) => ({
		organization: one(organization, {
			fields: [suppressionEntry.organizationId],
			references: [organization.id],
		}),
	}),
);

export const consentRecordRelations = relations(consentRecord, ({ one }) => ({
	organization: one(organization, {
		fields: [consentRecord.organizationId],
		references: [organization.id],
	}),
	lead: one(lead, { fields: [consentRecord.leadId], references: [lead.id] }),
}));

export type SuppressionEntry = typeof suppressionEntry.$inferSelect;
export type ConsentRecord = typeof consentRecord.$inferSelect;
export type AuditEvent = typeof auditEvent.$inferSelect;
