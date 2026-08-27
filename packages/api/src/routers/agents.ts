import { agent as agentTable } from "@doki/db/schema";
import { recordAudit } from "@doki/domain";
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
