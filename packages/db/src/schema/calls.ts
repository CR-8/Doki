import { relations, sql } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	real,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { agent } from "./agents";
import { user } from "./auth";
import {
	callDirectionEnum,
	callPurposeEnum,
	callStatusEnum,
	salesOutcomeEnum,
} from "./enums";
import { lead } from "./leads";
import { organization } from "./tenant";

export const call = pgTable(
	"call",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		leadId: uuid("lead_id").references(() => lead.id, { onDelete: "set null" }),
		agentId: uuid("agent_id").references(() => agent.id, {
			onDelete: "set null",
		}),

		direction: callDirectionEnum("direction").default("OUTBOUND").notNull(),
		purpose: callPurposeEnum("purpose").default("SERVICE").notNull(),

		/** Technical state, driven by provider webhooks. */
		status: callStatusEnum("status").default("QUEUED").notNull(),
		/** Business result, proposed by AI and confirmed by our own code. */
		outcome: salesOutcomeEnum("outcome").default("UNKNOWN").notNull(),

		fromNumber: text("from_number"),
		toNumber: text("to_number").notNull(),

		/**
		 * Idempotency. `idempotencyKey` is generated BEFORE we touch the provider,
		 * so a retried dispatch can never place a second call. `providerCallId` is
		 * written back once the provider accepts, and is unique so duplicate
		 * webhooks collapse onto one row.
		 */
		idempotencyKey: text("idempotency_key").notNull(),
		providerCallId: text("provider_call_id"),
		provider: text("provider").default("vapi").notNull(),

		attempt: integer("attempt").default(1).notNull(),

		queuedAt: timestamp("queued_at").defaultNow().notNull(),
		startedAt: timestamp("started_at"),
		answeredAt: timestamp("answered_at"),
		endedAt: timestamp("ended_at"),

		durationSeconds: integer("duration_seconds").default(0).notNull(),
		/** Talk time only — what we actually meter the customer for. */
		billableSeconds: integer("billable_seconds").default(0).notNull(),

		recordingUrl: text("recording_url"),
		transcriptText: text("transcript_text"),

		/** Provider's reason string, e.g. "customer-ended-call", "silence-timeout". */
		endedReason: text("ended_reason"),
		error: text("error"),

		// ---- Cost attribution ------------------------------------------------
		// Rolled up onto the call so gross margin per outcome is a single query,
		// not a reporting project.
		telephonyCostInr: numeric("telephony_cost_inr", { precision: 12, scale: 4 })
			.default("0")
			.notNull(),
		sttCostInr: numeric("stt_cost_inr", { precision: 12, scale: 4 })
			.default("0")
			.notNull(),
		ttsCostInr: numeric("tts_cost_inr", { precision: 12, scale: 4 })
			.default("0")
			.notNull(),
		llmCostInr: numeric("llm_cost_inr", { precision: 12, scale: 4 })
			.default("0")
			.notNull(),
		platformCostInr: numeric("platform_cost_inr", { precision: 12, scale: 4 })
			.default("0")
			.notNull(),
		totalCostInr: numeric("total_cost_inr", { precision: 12, scale: 4 })
			.default("0")
			.notNull(),

		/** Who pressed the button, when a call is placed manually. */
		triggeredBy: text("triggered_by").references(() => user.id, {
			onDelete: "set null",
		}),

		metadata: jsonb("metadata")
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
		uniqueIndex("call_org_idempotency_uidx").on(
			table.organizationId,
			table.idempotencyKey,
		),
		uniqueIndex("call_provider_call_uidx")
			.on(table.provider, table.providerCallId)
			.where(sql`${table.providerCallId} is not null`),
		index("call_org_status_idx").on(table.organizationId, table.status),
		index("call_org_created_idx").on(table.organizationId, table.createdAt),
		index("call_lead_idx").on(table.leadId),
	],
);

/** One row per conversational turn. Never a giant blob on the call row. */
export const callMessage = pgTable(
	"call_message",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		callId: uuid("call_id")
			.notNull()
			.references(() => call.id, { onDelete: "cascade" }),

		/** "assistant" = the AI, "user" = the person on the phone. */
		role: text("role").notNull(),
		content: text("content").notNull(),

		/** Milliseconds from call start — lets the UI sync transcript to audio. */
		offsetMs: integer("offset_ms").default(0).notNull(),
		sequence: integer("sequence").notNull(),

		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("call_message_call_seq_uidx").on(table.callId, table.sequence),
		index("call_message_call_idx").on(table.callId),
	],
);

export type AnalysisObjection = {
	objection: string;
	handled: boolean;
	quote?: string;
};

/**
 * Post-call AI output. Written asynchronously, schema-validated before insert.
 * `outcome` here is the AI's PROPOSAL — application code decides whether to
 * promote it onto `call.outcome` and `lead.status`.
 */
export const callAnalysis = pgTable(
	"call_analysis",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		callId: uuid("call_id")
			.notNull()
			.references(() => call.id, { onDelete: "cascade" }),

		summary: text("summary").notNull(),
		proposedOutcome: salesOutcomeEnum("proposed_outcome")
			.default("UNKNOWN")
			.notNull(),
		objections: jsonb("objections")
			.$type<AnalysisObjection[]>()
			.default([])
			.notNull(),
		qualification: jsonb("qualification")
			.$type<Record<string, unknown>>()
			.default({})
			.notNull(),
		nextAction: text("next_action"),
		nextActionAt: timestamp("next_action_at"),

		/** 0..1. Low confidence means a human reviews before we act on it. */
		confidence: real("confidence").default(0).notNull(),

		/** True if a guardrail was breached during the call. Surfaced in the UI. */
		guardrailFlags: jsonb("guardrail_flags")
			.$type<string[]>()
			.default([])
			.notNull(),

		model: text("model").notNull(),
		rawOutput: jsonb("raw_output").$type<Record<string, unknown>>(),

		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [uniqueIndex("call_analysis_call_uidx").on(table.callId)],
);

export const callRelations = relations(call, ({ one, many }) => ({
	organization: one(organization, {
		fields: [call.organizationId],
		references: [organization.id],
	}),
	lead: one(lead, { fields: [call.leadId], references: [lead.id] }),
	agent: one(agent, { fields: [call.agentId], references: [agent.id] }),
	messages: many(callMessage),
	analysis: one(callAnalysis, {
		fields: [call.id],
		references: [callAnalysis.callId],
	}),
}));

export const callMessageRelations = relations(callMessage, ({ one }) => ({
	call: one(call, { fields: [callMessage.callId], references: [call.id] }),
}));

export const callAnalysisRelations = relations(callAnalysis, ({ one }) => ({
	call: one(call, { fields: [callAnalysis.callId], references: [call.id] }),
}));

export type Call = typeof call.$inferSelect;
export type NewCall = typeof call.$inferInsert;
export type CallMessage = typeof callMessage.$inferSelect;
export type CallAnalysis = typeof callAnalysis.$inferSelect;
