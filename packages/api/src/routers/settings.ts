import { organizationSettings } from "@doki/db/schema";
import { recordAudit } from "@doki/domain";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { tenantProcedure } from "../index";

/** "HH:MM" or "HH:MM:SS" — Postgres `time` accepts both. */
const timeSchema = z
	.string()
	.regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use HH:MM (24-hour)");

export const settingsRouter = {
	get: tenantProcedure.handler(async ({ context }) => {
		const { db, organizationId } = context;

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
	}),

	/**
	 * Updates workspace calling policy.
	 *
	 * Bounds are enforced here rather than trusted from the client: the
	 * calling window cannot be widened past 06:00-22:00, because the whole
	 * value of this gate is that it cannot be configured away by accident.
	 */
	update: tenantProcedure
		.input(
			z.object({
				callingWindowStart: timeSchema.optional(),
				callingWindowEnd: timeSchema.optional(),
				defaultTimezone: z.string().min(1).max(64).optional(),
				allowWeekendCalls: z.boolean().optional(),
				dltEntityId: z.string().trim().max(64).nullish(),
				registeredCallerId: z.string().trim().max(32).nullish(),
				defaultCallPurpose: z
					.enum(["PROMOTIONAL", "TRANSACTIONAL", "SERVICE"])
					.optional(),
				maxAttemptsPerLead: z.number().int().min(1).max(10).optional(),
				minMinutesBetweenAttempts: z
					.number()
					.int()
					.min(30)
					.max(10080)
					.optional(),
				optOutFreezeDays: z.number().int().min(90).max(3650).optional(),
				maxConcurrentCalls: z.number().int().min(1).max(50).optional(),
				monthlyMinutesCap: z.number().int().min(0).max(1_000_000).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId, user } = context;

			const patch: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(input)) {
				if (value === undefined) continue;
				patch[key] = key === "allowWeekendCalls" ? (value ? 1 : 0) : value;
			}

			if (Object.keys(patch).length === 0) {
				const [current] = await db
					.select()
					.from(organizationSettings)
					.where(eq(organizationSettings.organizationId, organizationId))
					.limit(1);
				return current;
			}

			const [updated] = await db
				.update(organizationSettings)
				.set(patch)
				.where(eq(organizationSettings.organizationId, organizationId))
				.returning();

			await recordAudit(db, {
				organizationId,
				actor: { type: "USER", id: user.id },
				action: "settings.updated",
				resourceType: "organization_settings",
				resourceId: organizationId,
				metadata: { changed: Object.keys(patch) },
			});

			return updated;
		}),
};
