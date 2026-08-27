import { relations } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { agentStatusEnum, callPurposeEnum } from "./enums";
import { organization } from "./tenant";

export type AgentFaq = { question: string; answer: string };

/**
 * Guardrails are enforced OUTSIDE the prompt wherever possible. Anything the
 * model is merely *asked* not to do is advisory; anything listed here is also
 * checked after generation and before the words reach the caller.
 */
export type AgentGuardrails = {
	/** Hard refusals — agent must deflect to a human instead of answering. */
	forbiddenTopics: string[];
	/** Agent may never state prices/discounts/contract terms. */
	neverQuotePricing: boolean;
	/** Agent may never claim to be human if asked directly. */
	mustAdmitAiIfAsked: boolean;
	/** Escalate to a human on these detected intents. */
	escalateOn: string[];
	/** Max words per spoken turn — keeps latency and cost down. */
	maxWordsPerTurn: number;
};

export const agent = pgTable(
	"agent",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),

		name: text("name").notNull(),
		status: agentStatusEnum("status").default("DRAFT").notNull(),

		/** One sentence: what a successful call achieves. */
		objective: text("objective").notNull(),

		/** BCP-47-ish tag. "hi-IN", "en-IN", or "hi-en" for code-mixed Hinglish. */
		language: text("language").default("hi-en").notNull(),

		/**
		 * MANDATORY AI disclosure, spoken as the first utterance of every call.
		 * Not optional and not editable away — the dispatcher refuses to dial an
		 * agent whose disclosure is blank.
		 */
		aiDisclosure: text("ai_disclosure")
			.default("Namaste, main {{business_name}} ki AI assistant bol rahi hoon.")
			.notNull(),

		/** Spoken after the disclosure. Persona, tone, and the actual pitch. */
		instructions: text("instructions").notNull(),

		faqs: jsonb("faqs").$type<AgentFaq[]>().default([]).notNull(),

		guardrails: jsonb("guardrails")
			.$type<AgentGuardrails>()
			.default({
				forbiddenTopics: [],
				neverQuotePricing: true,
				mustAdmitAiIfAsked: true,
				escalateOn: ["legal_threat", "complaint", "asks_for_human"],
				maxWordsPerTurn: 45,
			})
			.notNull(),

		/** Regulatory series this agent's traffic belongs to. */
		callPurpose: callPurposeEnum("call_purpose").default("SERVICE").notNull(),

		// Provider configuration — resolved through the connector layer, never
		// imported directly by business logic.
		voiceProvider: text("voice_provider").default("vapi").notNull(),
		voiceId: text("voice_id"),
		llmModel: text("llm_model").default("gpt-4o-mini").notNull(),

		/** Hard stop. Protects against a stuck call burning minutes. */
		maxCallSeconds: integer("max_call_seconds").default(300).notNull(),

		/** Provider-side agent id, once published. */
		externalAgentId: text("external_agent_id"),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("agent_org_status_idx").on(table.organizationId, table.status),
	],
);

export const agentRelations = relations(agent, ({ one }) => ({
	organization: one(organization, {
		fields: [agent.organizationId],
		references: [organization.id],
	}),
}));

export type Agent = typeof agent.$inferSelect;
export type NewAgent = typeof agent.$inferInsert;
