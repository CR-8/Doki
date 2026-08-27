import { auditEvent } from "@doki/db/schema";

import type { PolicyDecision } from "./policy/can-call";

export type AuditActor =
	| { type: "USER"; id: string }
	| { type: "SYSTEM"; id?: string }
	| { type: "AI"; id?: string }
	| { type: "PROVIDER"; id?: string };

export type AuditInput = {
	organizationId: string;
	actor: AuditActor;
	action: string;
	resourceType: string;
	resourceId?: string | null;
	reason?: string | null;
	metadata?: Record<string, unknown>;
};

/**
 * Appends to the audit trail. Never throws into the caller's path — an audit
 * write failing must not take down the action it was recording, but it must
 * be loud in the logs.
 */
// biome-ignore lint/suspicious/noExplicitAny: drizzle's inferred db type is not portable across packages
export async function recordAudit(db: any, input: AuditInput): Promise<void> {
	try {
		await db.insert(auditEvent).values({
			organizationId: input.organizationId,
			actorType: input.actor.type,
			actorId: input.actor.id ?? null,
			action: input.action,
			resourceType: input.resourceType,
			resourceId: input.resourceId ?? null,
			reason: input.reason ?? null,
			metadata: input.metadata ?? {},
		});
	} catch (error) {
		console.error("[audit] failed to record event", {
			action: input.action,
			error,
		});
	}
}

/**
 * Records the outcome of a policy check. Both allowed AND refused decisions
 * are written — "why did it not call this lead?" is the single most common
 * support question this product will get, and the answer must be in the data.
 */
export async function recordPolicyDecision(
	// biome-ignore lint/suspicious/noExplicitAny: see above
	db: any,
	input: {
		organizationId: string;
		leadId: string;
		actor: AuditActor;
		decision: PolicyDecision;
	},
): Promise<void> {
	const { decision } = input;
	await recordAudit(db, {
		organizationId: input.organizationId,
		actor: input.actor,
		action: decision.allowed ? "call.policy.allowed" : "call.policy.refused",
		resourceType: "lead",
		resourceId: input.leadId,
		reason: decision.allowed ? null : decision.reason,
		metadata: decision.allowed
			? {}
			: {
					code: decision.code,
					retryAt: decision.retryAt?.toISOString() ?? null,
				},
	});
}
