import {
	agent as agentTable,
	type FollowUpAction,
	followUpAction,
} from "@doki/db/schema";
import { and, eq, lt } from "drizzle-orm";

import { type AuditActor, recordAudit } from "../audit";

export type FollowUpType = "CALL" | "EMAIL" | "TASK" | "MEETING";

export type ScheduleInput = {
	organizationId: string;
	leadId: string;
	type: FollowUpType;
	dueAt: Date;
	sourceCallId?: string | null;
	agentId?: string | null;
	note?: string | null;
	source?: "AI_ANALYSIS" | "MANUAL" | "RETRY_POLICY";
	actor: AuditActor;
	/** Overrides the derived key when the caller needs a specific one. */
	idempotencyKey?: string;
};

/**
 * Derives a stable key so the same decision cannot be scheduled twice.
 *
 * Keyed on the source call rather than a timestamp: re-running analysis on a
 * call is a normal operation, and it must update or no-op rather than pile up
 * duplicate follow-ups the customer would see as repeated calls.
 */
function deriveKey(input: ScheduleInput): string {
	if (input.idempotencyKey) return input.idempotencyKey;
	if (input.sourceCallId) return `followup:${input.sourceCallId}:${input.type}`;
	return `followup:lead:${input.leadId}:${input.type}:${input.dueAt.toISOString()}`;
}

/**
 * Schedules a follow-up. Safe to call repeatedly for the same source.
 *
 * Returns the row whether it was created or already existed, so callers do not
 * have to distinguish "scheduled" from "already scheduled".
 */
export async function scheduleFollowUp(
	// biome-ignore lint/suspicious/noExplicitAny: drizzle db type is not portable across packages
	db: any,
	input: ScheduleInput,
): Promise<FollowUpAction | null> {
	const idempotencyKey = deriveKey(input);

	// A CALL needs an agent to speak. Fall back to the workspace's first
	// active one so an analysis-driven follow-up is still actionable.
	let agentId = input.agentId ?? null;
	if (input.type === "CALL" && !agentId) {
		const [fallback] = await db
			.select({ id: agentTable.id })
			.from(agentTable)
			.where(
				and(
					eq(agentTable.organizationId, input.organizationId),
					eq(agentTable.status, "ACTIVE"),
				),
			)
			.limit(1);
		agentId = fallback?.id ?? null;
	}

	const [row] = (await db
		.insert(followUpAction)
		.values({
			organizationId: input.organizationId,
			leadId: input.leadId,
			sourceCallId: input.sourceCallId ?? null,
			agentId,
			type: input.type,
			dueAt: input.dueAt,
			note: input.note ?? null,
			source: input.source ?? "AI_ANALYSIS",
			idempotencyKey,
		})
		.onConflictDoUpdate({
			target: [followUpAction.organizationId, followUpAction.idempotencyKey],
			// Only reschedule something that has not run yet.
			set: { dueAt: input.dueAt, note: input.note ?? null },
			where: eq(followUpAction.status, "PENDING"),
		})
		.returning()) as FollowUpAction[];

	if (row) {
		await recordAudit(db, {
			organizationId: input.organizationId,
			actor: input.actor,
			action: "followup.scheduled",
			resourceType: "follow_up_action",
			resourceId: row.id,
			metadata: {
				type: input.type,
				dueAt: input.dueAt.toISOString(),
				leadId: input.leadId,
			},
		});
	}

	return row ?? null;
}

/** Cancels a pending follow-up. Running or settled rows are left alone. */
export async function cancelFollowUp(
	// biome-ignore lint/suspicious/noExplicitAny: see above
	db: any,
	input: {
		organizationId: string;
		id: string;
		actor: AuditActor;
		reason?: string;
	},
): Promise<boolean> {
	const [row] = await db
		.update(followUpAction)
		.set({
			status: "CANCELED",
			completedAt: new Date(),
			lastError: input.reason ?? null,
		})
		.where(
			and(
				eq(followUpAction.organizationId, input.organizationId),
				eq(followUpAction.id, input.id),
				eq(followUpAction.status, "PENDING"),
			),
		)
		.returning({ id: followUpAction.id });

	if (row) {
		await recordAudit(db, {
			organizationId: input.organizationId,
			actor: input.actor,
			action: "followup.canceled",
			resourceType: "follow_up_action",
			resourceId: input.id,
			reason: input.reason ?? null,
		});
	}

	return Boolean(row);
}

/**
 * Releases rows whose runner died mid-execution.
 *
 * Without this a crashed worker would strand its claims as RUNNING forever.
 * Anything held longer than the timeout is assumed dead and returned to the
 * queue, where the attempt counter still bounds how often it can be retried.
 */
export async function reclaimStalled(
	// biome-ignore lint/suspicious/noExplicitAny: see above
	db: any,
	staleAfterMinutes = 10,
): Promise<number> {
	const cutoff = new Date(Date.now() - staleAfterMinutes * 60 * 1000);

	const rows = await db
		.update(followUpAction)
		.set({ status: "PENDING", lockedAt: null, lockedBy: null })
		.where(
			and(
				eq(followUpAction.status, "RUNNING"),
				lt(followUpAction.lockedAt, cutoff),
			),
		)
		.returning({ id: followUpAction.id });

	return rows.length;
}
