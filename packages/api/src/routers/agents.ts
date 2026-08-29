import { getLlmProvider } from "@doki/connectors/llm/index";
import { voicesForModel } from "@doki/connectors/tts/index";
import { agent as agentTable, organization } from "@doki/db/schema";
import { buildScriptPrompt, callScriptSchema, recordAudit } from "@doki/domain";
import { env } from "@doki/env/server";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { tenantProcedure } from "../index";

const faqSchema = z.object({
	question: z.string().trim().min(1).max(300),
	answer: z.string().trim().min(1).max(1200),
});

const guardrailsSchema = z.object({
	forbiddenTopics: z.array(z.string().trim().max(80)).max(20).default([]),
	neverQuotePricing: z.boolean().default(true),
	mustAdmitAiIfAsked: z.boolean().default(true),
	escalateOn: z.array(z.string().trim().max(60)).max(10).default([]),
	maxWordsPerTurn: z.number().int().min(10).max(120).default(45),
});

/**
 * The AI disclosure is required at the schema level, not merely encouraged.
 * An agent cannot be saved without one, and dispatch refuses to dial if it is
 * somehow blank.
 */
const disclosureSchema = z
	.string()
	.trim()
	.min(10, "Disclosure must state clearly that the caller is an AI")
	.max(300);

export const agentsRouter = {
	/**
	 * Voices an agent can be given.
	 *
	 * Served from the connector rather than hard-coded in the console, so the
	 * list tracks whatever model the deployment is configured for. Sarvam
	 * retired every bulbul:v2 speaker when v3 landed; a list duplicated in a
	 * form would have kept offering names the API no longer accepts.
	 */
	voices: tenantProcedure.handler(() => {
		const model = env.SARVAM_TTS_MODEL;
		return {
			model,
			defaultVoice: env.SARVAM_TTS_SPEAKER,
			voices: voicesForModel(model),
		};
	}),

	/**
	 * Drafts the spoken script for a one-way call.
	 *
	 * Returns the draft rather than saving it: this is copy that will be read to
	 * a real person on a recorded call, so a human approves it before it can be
	 * dialled. The disclosure is never part of what the model writes — it is
	 * prepended deterministically, so the legally required sentence cannot be
	 * reworded or dropped.
	 */
	generateScript: tenantProcedure
		.input(z.object({ id: z.uuid() }))
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;

			const [row] = await db
				.select()
				.from(agentTable)
				.where(
					and(
						eq(agentTable.organizationId, organizationId),
						eq(agentTable.id, input.id),
					),
				)
				.limit(1);
			if (!row)
				throw new ORPCError("NOT_FOUND", { message: "Agent not found" });

			let llm: ReturnType<typeof getLlmProvider>;
			try {
				llm = getLlmProvider();
			} catch (error) {
				throw new ORPCError("PRECONDITION_FAILED", {
					message:
						error instanceof Error
							? error.message
							: "No LLM configured for this deployment.",
				});
			}

			const [org] = await db
				.select({ name: organization.name })
				.from(organization)
				.where(eq(organization.id, organizationId))
				.limit(1);

			const prompt = buildScriptPrompt({
				agent: row,
				businessName: org?.name ?? "our team",
			});

			const result = await llm.generateStructured({
				system: prompt.system,
				messages: [{ role: "user", content: prompt.user }],
				schema: callScriptSchema,
				schemaName: "call_script",
				temperature: 0.7,
				maxOutputTokens: 600,
			});

			return {
				script: result.data.script,
				rationale: result.data.rationale,
				model: result.model,
			};
		}),

	list: tenantProcedure.handler(async ({ context }) => {
		const { db, organizationId } = context;
		return db
			.select()
			.from(agentTable)
			.where(eq(agentTable.organizationId, organizationId))
			.orderBy(desc(agentTable.createdAt));
	}),

	get: tenantProcedure
		.input(z.object({ id: z.uuid() }))
		.handler(async ({ context, input }) => {
			const { db, organizationId } = context;
			const [row] = await db
				.select()
				.from(agentTable)
				.where(
					and(
						eq(agentTable.organizationId, organizationId),
						eq(agentTable.id, input.id),
					),
				)
				.limit(1);
			if (!row)
				throw new ORPCError("NOT_FOUND", { message: "Agent not found" });
			return row;
		}),

	create: tenantProcedure
		.input(
			z.object({
				name: z.string().trim().min(1).max(120),
				objective: z.string().trim().min(1).max(400),
				instructions: z.string().trim().min(1).max(6000),
				callScript: z.string().trim().max(1500).nullish(),
				aiDisclosure: disclosureSchema,
				language: z.string().trim().min(2).max(16).default("hi-en"),
				callPurpose: z
					.enum(["PROMOTIONAL", "TRANSACTIONAL", "SERVICE"])
					.default("SERVICE"),
				voiceId: z.string().trim().max(120).nullish(),
				maxCallSeconds: z.number().int().min(30).max(1800).default(300),
				faqs: z.array(faqSchema).max(30).default([]),
				guardrails: guardrailsSchema.optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId, user } = context;

			const [created] = await db
				.insert(agentTable)
				.values({
					organizationId,
					name: input.name,
					objective: input.objective,
					instructions: input.instructions,
					callScript: input.callScript ?? null,
					aiDisclosure: input.aiDisclosure,
					language: input.language,
					callPurpose: input.callPurpose,
					voiceId: input.voiceId ?? null,
					maxCallSeconds: input.maxCallSeconds,
					faqs: input.faqs,
					status: "ACTIVE",
					...(input.guardrails ? { guardrails: input.guardrails } : {}),
				})
				.returning();

			await recordAudit(db, {
				organizationId,
				actor: { type: "USER", id: user.id },
				action: "agent.created",
				resourceType: "agent",
				resourceId: created?.id,
			});

			return created;
		}),

	update: tenantProcedure
		.input(
			z.object({
				id: z.uuid(),
				name: z.string().trim().min(1).max(120).optional(),
				objective: z.string().trim().min(1).max(400).optional(),
				instructions: z.string().trim().min(1).max(6000).optional(),
				callScript: z.string().trim().max(1500).nullish(),
				aiDisclosure: disclosureSchema.optional(),
				language: z.string().trim().min(2).max(16).optional(),
				callPurpose: z
					.enum(["PROMOTIONAL", "TRANSACTIONAL", "SERVICE"])
					.optional(),
				voiceId: z.string().trim().max(120).nullish(),
				maxCallSeconds: z.number().int().min(30).max(1800).optional(),
				status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
				faqs: z.array(faqSchema).max(30).optional(),
				guardrails: guardrailsSchema.optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId, user } = context;
			const { id, ...rest } = input;

			const patch: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(rest)) {
				if (value !== undefined) patch[key] = value;
			}

			if (Object.keys(patch).length === 0) {
				throw new ORPCError("BAD_REQUEST", { message: "Nothing to update" });
			}

			const [updated] = await db
				.update(agentTable)
				.set(patch)
				.where(
					and(
						eq(agentTable.organizationId, organizationId),
						eq(agentTable.id, id),
					),
				)
				.returning();

			if (!updated)
				throw new ORPCError("NOT_FOUND", { message: "Agent not found" });

			await recordAudit(db, {
				organizationId,
				actor: { type: "USER", id: user.id },
				action: "agent.updated",
				resourceType: "agent",
				resourceId: id,
				metadata: { changed: Object.keys(patch) },
			});

			return updated;
		}),
};
