import {
	type Agent,
	agent as agentTable,
	type Call,
	call as callTable,
	type Lead,
	lead as leadTable,
	organization as organizationTable,
} from "@doki/db/schema";
import { and, eq, sql } from "drizzle-orm";

import { type AuditActor, recordAudit, recordPolicyDecision } from "../audit";
import {
	type CallPurpose,
	evaluatePolicy,
	loadPolicyContext,
	type PolicyDecision,
} from "../policy/can-call";
import {
	buildFirstMessage,
	buildSystemPrompt,
	MissingDisclosureError,
} from "./prompt";

/** Minimal surface we need from the voice connector, kept structural to avoid a package cycle. */
export type VoiceDispatcher = {
	readonly name: string;
	placeCall(req: {
		callId: string;
		organizationId: string;
		toNumber: string;
		externalAgentId?: string;
		firstMessage: string;
		systemPrompt: string;
		language: string;
		voiceId?: string;
		maxCallSeconds: number;
		idempotencyKey: string;
		metadata?: Record<string, unknown>;
	}): Promise<{ providerCallId: string; status: string }>;
};

export type DispatchResult =
	| { ok: true; call: Call }
	| {
			ok: false;
			kind: "POLICY";
			decision: Extract<PolicyDecision, { allowed: false }>;
	  }
	| { ok: false; kind: "ERROR"; message: string; call: Call | null };

export type DispatchInput = {
	organizationId: string;
	leadId: string;
	agentId: string;
	actor: AuditActor;
	purpose?: CallPurpose;
	now?: Date;
};

/**
 * Deterministic idempotency key for one intended attempt.
 *
 * Keyed on the attempt number rather than a random value, so retrying the
 * *same* dispatch collides on the unique index and cannot place a second call,
 * while a genuine next attempt gets its own key.
 */
function idempotencyKeyFor(leadId: string, attempt: number): string {
	return `call:${leadId}:${attempt}`;
}

/**
 * Places one outbound call.
 *
 * Sequence matters:
 *   1. policy gate (refusals never reach a provider)
 *   2. transaction — claim the idempotency key and consume the attempt
 *   3. provider call
 *   4. write back the provider reference
 *
 * The row is committed BEFORE the provider is contacted. If the process dies
 * mid-dial we are left with a QUEUED row we can reconcile, rather than a live
 * call nothing in our database knows about.
 */
export async function dispatchCall(
	// biome-ignore lint/suspicious/noExplicitAny: drizzle db type is not portable across packages
	db: any,
	voice: VoiceDispatcher,
	input: DispatchInput,
): Promise<DispatchResult> {
	const now = input.now ?? new Date();
	const { organizationId, leadId, agentId } = input;

	const [lead] = (await db
		.select()
		.from(leadTable)
		.where(
			and(
				eq(leadTable.organizationId, organizationId),
				eq(leadTable.id, leadId),
			),
		)
		.limit(1)) as Lead[];

	if (!lead) {
		return {
			ok: false,
			kind: "POLICY",
			decision: {
				allowed: false,
				code: "LEAD_NOT_FOUND",
				reason: "Lead not found in this workspace.",
				retryAt: null,
			},
		};
	}

	const [agent] = (await db
		.select()
		.from(agentTable)
		.where(
			and(
				eq(agentTable.organizationId, organizationId),
				eq(agentTable.id, agentId),
			),
		)
		.limit(1)) as Agent[];

	if (!agent) {
		return {
			ok: false,
			kind: "ERROR",
			message: "Agent not found in this workspace.",
			call: null,
		};
	}

	const purpose = input.purpose ?? (agent.callPurpose as CallPurpose);

	// --- 1. Policy gate ---------------------------------------------------
	const ctx = await loadPolicyContext(db, {
		organizationId,
		phones: [lead.phoneE164],
		now,
	});

	if (!ctx) {
		return {
			ok: false,
			kind: "POLICY",
			decision: {
				allowed: false,
				code: "SETTINGS_MISSING",
				reason: "Workspace calling policy is not configured.",
				retryAt: null,
			},
		};
	}

	const decision = evaluatePolicy(ctx, lead, purpose);
	await recordPolicyDecision(db, {
		organizationId,
		leadId,
		actor: input.actor,
		decision,
	});

	if (!decision.allowed) {
		return { ok: false, kind: "POLICY", decision };
	}

	// --- Build the conversation before touching state ---------------------
	const [org] = await db
		.select({ name: organizationTable.name })
		.from(organizationTable)
		.where(eq(organizationTable.id, organizationId))
		.limit(1);
	const businessName = org?.name ?? "our team";

	let firstMessage: string;
	let systemPrompt: string;
	try {
		firstMessage = buildFirstMessage({ agent, lead, businessName });
		systemPrompt = buildSystemPrompt({ agent, lead, businessName });
	} catch (error) {
		const message =
			error instanceof MissingDisclosureError
				? error.message
				: "Could not build agent prompt.";
		await recordAudit(db, {
			organizationId,
			actor: input.actor,
			action: "call.dispatch.refused",
			resourceType: "lead",
			resourceId: leadId,
			reason: message,
		});
		return { ok: false, kind: "ERROR", message, call: null };
	}

	// --- 2. Claim the attempt atomically ----------------------------------
	const attempt = lead.attemptCount + 1;
	const idempotencyKey = idempotencyKeyFor(leadId, attempt);
	const retryAfterMs = ctx.settings.minMinutesBetweenAttempts * 60 * 1000;

	let created: Call;
	try {
		created = await db.transaction(async (tx: typeof db) => {
			const [row] = (await tx
				.insert(callTable)
				.values({
					organizationId,
					leadId,
					agentId,
					direction: "OUTBOUND",
					purpose,
					status: "QUEUED",
					toNumber: lead.phoneE164,
					idempotencyKey,
					provider: voice.name,
					attempt,
					triggeredBy:
						input.actor.type === "USER" ? (input.actor.id ?? null) : null,
					queuedAt: now,
				})
				.returning()) as Call[];

			if (!row) throw new Error("DUPLICATE_DISPATCH");

			await tx
				.update(leadTable)
				.set({
					attemptCount: sql`${leadTable.attemptCount} + 1`,
					lastAttemptAt: now,
					nextEligibleAt: new Date(now.getTime() + retryAfterMs),
					status: lead.status === "NEW" ? "ATTEMPTING_CONTACT" : lead.status,
				})
				.where(
					and(
						eq(leadTable.organizationId, organizationId),
						eq(leadTable.id, leadId),
					),
				);

			return row;
		});
	} catch (error) {
		// A unique-violation here means this exact attempt was already claimed.
		const message = String(error);
		const duplicate =
			message.includes("call_org_idempotency_uidx") ||
			message.includes("DUPLICATE_DISPATCH");
		return {
			ok: false,
			kind: "ERROR",
			message: duplicate
				? "This call attempt has already been dispatched."
				: "Could not create the call record.",
			call: null,
		};
	}

	// --- 3. Provider ------------------------------------------------------
	try {
		const placed = await voice.placeCall({
			callId: created.id,
			organizationId,
			toNumber: lead.phoneE164,
			externalAgentId: agent.externalAgentId ?? undefined,
			firstMessage,
			systemPrompt,
			language: agent.language,
			voiceId: agent.voiceId ?? undefined,
			maxCallSeconds: agent.maxCallSeconds,
			idempotencyKey,
			metadata: { leadId, agentId, attempt },
		});

		const [updated] = (await db
			.update(callTable)
			.set({
				providerCallId: placed.providerCallId,
				status: "DIALING",
				startedAt: new Date(),
			})
			.where(eq(callTable.id, created.id))
			.returning()) as Call[];

		await recordAudit(db, {
			organizationId,
			actor: input.actor,
			action: "call.dispatched",
			resourceType: "call",
			resourceId: created.id,
			metadata: { leadId, agentId, attempt, provider: voice.name, purpose },
		});

		return { ok: true, call: updated ?? created };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Provider rejected the call.";

		const [failed] = (await db
			.update(callTable)
			.set({
				status: "FAILED",
				error: message.slice(0, 500),
				endedAt: new Date(),
			})
			.where(eq(callTable.id, created.id))
			.returning()) as Call[];

		await recordAudit(db, {
			organizationId,
			actor: { type: "SYSTEM" },
			action: "call.dispatch.failed",
			resourceType: "call",
			resourceId: created.id,
			reason: message.slice(0, 500),
		});

		return { ok: false, kind: "ERROR", message, call: failed ?? created };
	}
}
