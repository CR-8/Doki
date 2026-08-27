import { relations } from "drizzle-orm";
import {
	index,
	integer,
	pgTable,
	text,
	time,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { callPurposeEnum } from "./enums";

/**
 * Tenant boundary. Every customer-owned row in this database references
 * `organization.id`. Repository helpers must take it as a mandatory argument.
 * Managed by the Better Auth `organization` plugin.
 */
export const organization = pgTable("organization", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	logo: text("logo"),
	metadata: text("metadata"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const member = pgTable(
	"member",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").default("member").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("member_org_user_uidx").on(table.organizationId, table.userId),
		index("member_org_idx").on(table.organizationId),
	],
);

export const invitation = pgTable(
	"invitation",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role"),
		status: text("status").default("pending").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		inviterId: text("inviter_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [index("invitation_org_idx").on(table.organizationId)],
);

/**
 * Per-tenant calling policy. These are DETERMINISTIC rules enforced in code
 * before any dial — never delegated to a prompt.
 *
 * Defaults encode TRAI TCCCPR baselines:
 *  - promotional calling window 09:00–21:00 in the lead's local timezone
 *  - promotional traffic must originate from a registered 140-series number
 *  - opt-outs are honoured immediately, with a 90-day re-contact freeze
 */
export const organizationSettings = pgTable("organization_settings", {
	organizationId: text("organization_id")
		.primaryKey()
		.references(() => organization.id, { onDelete: "cascade" }),

	// Calling window, applied in the lead's own timezone.
	callingWindowStart: time("calling_window_start")
		.default("09:00:00")
		.notNull(),
	callingWindowEnd: time("calling_window_end").default("21:00:00").notNull(),
	defaultTimezone: text("default_timezone").default("Asia/Kolkata").notNull(),
	allowWeekendCalls: integer("allow_weekend_calls").default(0).notNull(),

	// Regulatory identity. Supplied and owned by the customer, not by us.
	dltEntityId: text("dlt_entity_id"),
	registeredCallerId: text("registered_caller_id"),
	defaultCallPurpose: callPurposeEnum("default_call_purpose")
		.default("SERVICE")
		.notNull(),

	// Attempt policy.
	maxAttemptsPerLead: integer("max_attempts_per_lead").default(3).notNull(),
	minMinutesBetweenAttempts: integer("min_minutes_between_attempts")
		.default(240)
		.notNull(),
	optOutFreezeDays: integer("opt_out_freeze_days").default(90).notNull(),

	// Hard ceiling so a misconfigured campaign cannot burn the customer's budget.
	maxConcurrentCalls: integer("max_concurrent_calls").default(3).notNull(),
	monthlyMinutesCap: integer("monthly_minutes_cap").default(1000).notNull(),

	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

export const organizationRelations = relations(
	organization,
	({ many, one }) => ({
		members: many(member),
		invitations: many(invitation),
		settings: one(organizationSettings, {
			fields: [organization.id],
			references: [organizationSettings.organizationId],
		}),
	}),
);

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id],
	}),
	user: one(user, { fields: [member.userId], references: [user.id] }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id],
	}),
	inviter: one(user, { fields: [invitation.inviterId], references: [user.id] }),
}));
