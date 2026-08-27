import { type FollowUpAction, followUpAction } from "@doki/db/schema";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";

import { recordAudit } from "../audit";
import { dispatchCall, type VoiceDispatcher } from "../calls/dispatch";

export type RunnerResult = {
	claimed: number;
	succeeded: number;
	skipped: number;
	failed: number;
	reclaimed: number;
	details: {
		id: string;
		type: string;
		outcome: "SUCCEEDED" | "SKIPPED" | "FAILED";
		reason?: string;
	}[];
};

/**
 * Claims a batch of due follow-ups.
 *
 * `FOR UPDATE SKIP LOCKED` is what makes this safe to run concurrently: two
 * overlapping cron invocations, or two workers, each take a disjoint set of
 * rows instead of fighting over the same ones. The claim and the status flip
 * happen in one transaction, so a row is never visible as both PENDING and
 * held by a runner.
 */
export async function claimDueFollowUps(
	// biome-ignore lint/suspicious/noExplicitAny: drizzle db type is not portable across packages
	db: any,
	input: { limit: number; runnerId: string; now?: Date },
): Promise<FollowUpAction[]> {
	const now = input.now ?? new Date();

	return db.transaction(async (tx: typeof db) => {
		const candidates = (await tx
			.select({ id: followUpAction.id })
			.from(followUpAction)
			.where(
				and(
					eq(followUpAction.status, "PENDING"),
					lte(followUpAction.dueAt, now),
				),
			)
			.orderBy(asc(followUpAction.dueAt))
			.limit(input.limit)
			.for("update", { skipLocked: true })) as { id: string }[];

		if (candidates.length === 0) return [];

		const ids = candidates.map((c) => c.id);
		return (await tx
			.update(followUpAction)
			.set({
				status: "RUNNING",
				lockedAt: now,
				lockedBy: input.runnerId,
				attempt: sql`${followUpAction.attempt} + 1`,
			})
			.where(inArray(followUpAction.id, ids))
			.returning()) as FollowUpAction[];
	});
}

async function settle(
	// biome-ignore lint/suspicious/noExplicitAny: see above
	db: any,
	id: string,
	status: "SUCCEEDED" | "SKIPPED" | "FAILED" | "PENDING",
	error?: string | null,
): Promise<void> {
	await db
		.update(followUpAction)
		.set({
			status,
			lockedAt: null,
			lockedBy: null,
			lastError: error ?? null,
			completedAt: status === "PENDING" ? null : new Date(),
		})
		.where(eq(followUpAction.id, id));
}

/**
 * Executes claimed follow-ups.
 *
 * CALL actions go through `dispatchCall`, which means they pass the SAME
 * policy gate as a manually placed call — calling hours, suppression, consent,
 * attempt limits and capacity all apply. An automated follow-up is exactly
 * where a compliance breach would otherwise slip through unnoticed, so it gets
 * no shortcut.
 *
 * A policy refusal settles as SKIPPED rather than FAILED: the system did the
 * right thing, and retrying immediately would not change the answer.
 */
export async function runDueFollowUps(
	// biome-ignore lint/suspicious/noExplicitAny: see above
	db: any,
	voice: VoiceDispatcher,
	input: { limit?: number; runnerId: string; now?: Date },
): Promise<RunnerResult> {
	const claimed = await claimDueFollowUps(db, {
		limit: input.limit ?? 10,
		runnerId: input.runnerId,
		now: input.now,
	});

	const result: RunnerResult = {
		claimed: claimed.length,
		succeeded: 0,
		skipped: 0,
		failed: 0,
		reclaimed: 0,
		details: [],
	};

	for (const action of claimed) {
		try {
			if (action.type !== "CALL") {
				// EMAIL, TASK and MEETING have no executor yet. They are recorded
				// and surfaced in the console for a human, not silently dropped.
				await settle(
					db,
					action.id,
					"SKIPPED",
					`${action.type} actions are not automated yet`,
				);
				result.skipped++;
				result.details.push({
					id: action.id,
					type: action.type,
					outcome: "SKIPPED",
					reason: "no executor for this action type",
				});
				continue;
			}

			if (!action.agentId) {
				await settle(
					db,
					action.id,
					"FAILED",
					"No agent available to place the call",
				);
				result.failed++;
				result.details.push({
					id: action.id,
					type: action.type,
					outcome: "FAILED",
					reason: "no agent",
				});
				continue;
			}

			const dispatched = await dispatchCall(db, voice, {
				organizationId: action.organizationId,
				leadId: action.leadId,
				agentId: action.agentId,
				actor: { type: "SYSTEM", id: `followup:${action.id}` },
			});

			if (dispatched.ok) {
				await settle(db, action.id, "SUCCEEDED");
				result.succeeded++;
				result.details.push({
					id: action.id,
					type: action.type,
					outcome: "SUCCEEDED",
				});
				continue;
			}

			if (dispatched.kind === "POLICY") {
				const { code, reason, retryAt } = dispatched.decision;

				// A block that clears on its own — outside calling hours, retry
				// cooldown, capacity — is rescheduled rather than abandoned.
				if (retryAt && action.attempt < action.maxAttempts) {
					await db
						.update(followUpAction)
						.set({
							status: "PENDING",
							dueAt: retryAt,
							lockedAt: null,
							lockedBy: null,
							lastError: `Deferred: ${reason}`,
						})
						.where(eq(followUpAction.id, action.id));

					result.skipped++;
					result.details.push({
						id: action.id,
						type: action.type,
						outcome: "SKIPPED",
						reason: `deferred to ${retryAt.toISOString()} (${code})`,
					});
					continue;
				}

				await settle(db, action.id, "SKIPPED", reason);
				result.skipped++;
				result.details.push({
					id: action.id,
					type: action.type,
					outcome: "SKIPPED",
					reason: code,
				});
				continue;
			}

			// Provider or infrastructure failure — retry until the cap.
			const exhausted = action.attempt >= action.maxAttempts;
			await settle(
				db,
				action.id,
				exhausted ? "FAILED" : "PENDING",
				dispatched.message,
			);
			result.failed++;
			result.details.push({
				id: action.id,
				type: action.type,
				outcome: "FAILED",
				reason: dispatched.message,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const exhausted = action.attempt >= action.maxAttempts;
			await settle(db, action.id, exhausted ? "FAILED" : "PENDING", message);
			result.failed++;
			result.details.push({
				id: action.id,
				type: action.type,
				outcome: "FAILED",
				reason: message,
			});
		}
	}

	if (claimed.length > 0) {
		await recordAudit(db, {
			organizationId: claimed[0]?.organizationId ?? "",
			actor: { type: "SYSTEM", id: input.runnerId },
			action: "followup.batch.run",
			resourceType: "follow_up_action",
			metadata: {
				claimed: result.claimed,
				succeeded: result.succeeded,
				skipped: result.skipped,
				failed: result.failed,
			},
		});
	}

	return result;
}
