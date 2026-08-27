import { relations } from "drizzle-orm";
import {
	index,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { call } from "./calls";
import { usageKindEnum } from "./enums";
import { organization } from "./tenant";

/**
 * One row per metered operation. This is the raw ledger behind both customer
 * billing and our own unit economics — without it you cannot answer "what does
 * a booked meeting actually cost us?", which is the number the pricing depends on.
 */
export const usageEvent = pgTable(
	"usage_event",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		callId: uuid("call_id").references(() => call.id, { onDelete: "set null" }),

		kind: usageKindEnum("kind").notNull(),
		provider: text("provider").notNull(),
		model: text("model"),

		/** Seconds, characters, or tokens depending on `kind`. */
		units: numeric("units", { precision: 14, scale: 4 }).notNull(),
		unitCostInr: numeric("unit_cost_inr", { precision: 14, scale: 8 })
			.default("0")
			.notNull(),
		totalCostInr: numeric("total_cost_inr", { precision: 14, scale: 4 })
			.default("0")
			.notNull(),

		/** Collapses duplicate metering when a webhook is redelivered. */
		idempotencyKey: text("idempotency_key"),

		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.default({})
			.notNull(),
		occurredAt: timestamp("occurred_at").defaultNow().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("usage_org_occurred_idx").on(table.organizationId, table.occurredAt),
		index("usage_call_idx").on(table.callId),
		index("usage_org_kind_idx").on(table.organizationId, table.kind),
	],
);

export const usageEventRelations = relations(usageEvent, ({ one }) => ({
	organization: one(organization, {
		fields: [usageEvent.organizationId],
		references: [organization.id],
	}),
	call: one(call, { fields: [usageEvent.callId], references: [call.id] }),
}));

export type UsageEvent = typeof usageEvent.$inferSelect;
export type NewUsageEvent = typeof usageEvent.$inferInsert;
