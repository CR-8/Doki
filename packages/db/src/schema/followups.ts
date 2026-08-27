import { relations } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { agent } from "./agents";
import { call } from "./calls";
import { lead } from "./leads";
import { organization } from "./tenant";

export const followUpTypeEnum = pgEnum("follow_up_type", [
	"CALL",
	"EMAIL",
	"TASK",
	"MEETING",
]);

export const followUpStatusEnum = pgEnum("follow_up_status", [
	"PENDING",
	"RUNNING",
	"SUCCEEDED",
	"FAILED",
	"CANCELED",
	/** Policy refused it at execution time — not a failure, a correct outcome. */
	"SKIPPED",
]);

/**
 * Scheduled work, owned by PostgreSQL rather than a queue.
 *
 * The durability rule matters here: a follow-up that exists only inside Redis
 * or an in-memory timer is a promise to the customer that vanishes on the next
 * deploy. Rows here are the record of what must happen; a runner claims them
 * with SELECT ... FOR UPDATE SKIP LOCKED, so any number of concurrent workers
 * (or overlapping cron invocations) can drain the queue without collisions.
 */
export const followUpAction = pgTable(
	"follow_up_action",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),

		leadId: uuid("lead_id")
			.notNull()
			.references(() => lead.id, { onDelete: "cascade" }),
		/** The call this follow-up was decided from, when there is one. */
		sourceCallId: uuid("source_call_id").references(() => call.id, {
			onDelete: "set null",
		}),
		/** Which agent to use, for CALL actions. */
		agentId: uuid("agent_id").references(() => agent.id, {
			onDelete: "set null",
		}),

		type: followUpTypeEnum("type").notNull(),
		status: followUpStatusEnum("status").default("PENDING").notNull(),

		/** Nothing runs before this instant. */
		dueAt: timestamp("due_at").notNull(),

		attempt: integer("attempt").default(0).notNull(),
		maxAttempts: integer("max_attempts").default(3).notNull(),

		/**
		 * Prevents duplicates. Re-running analysis on the same call must not
		 * schedule the same follow-up twice.
		 */
		idempotencyKey: text("idempotency_key").notNull(),

		/** Human-readable rationale, shown in the console. */
		note: text("note"),
		/** "AI_ANALYSIS" | "MANUAL" | "RETRY_POLICY" */
		source: text("source").default("AI_ANALYSIS").notNull(),

		payload: jsonb("payload")
			.$type<Record<string, unknown>>()
			.default({})
			.notNull(),

		// ---- Claim bookkeeping ----------------------------------------------
		/** Set while a runner holds this row; cleared when it settles. */
		lockedAt: timestamp("locked_at"),
		lockedBy: text("locked_by"),

		lastError: text("last_error"),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		completedAt: timestamp("completed_at"),
	},
	(table) => [
		uniqueIndex("follow_up_org_idem_uidx").on(
			table.organizationId,
			table.idempotencyKey,
		),
		// The claim query's access path: due, pending, oldest first.
		index("follow_up_due_idx").on(table.status, table.dueAt),
		index("follow_up_org_status_idx").on(table.organizationId, table.status),
		index("follow_up_lead_idx").on(table.leadId),
	],
);

export const followUpActionRelations = relations(followUpAction, ({ one }) => ({
	organization: one(organization, {
		fields: [followUpAction.organizationId],
		references: [organization.id],
	}),
	lead: one(lead, { fields: [followUpAction.leadId], references: [lead.id] }),
	sourceCall: one(call, {
		fields: [followUpAction.sourceCallId],
		references: [call.id],
	}),
	agent: one(agent, {
		fields: [followUpAction.agentId],
		references: [agent.id],
	}),
}));

export type FollowUpAction = typeof followUpAction.$inferSelect;
export type NewFollowUpAction = typeof followUpAction.$inferInsert;
