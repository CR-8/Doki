import {
	call,
	dndRegistryCache,
	type Lead,
	lead as leadTable,
	organizationSettings,
	suppressionEntry,
} from "@doki/db/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { checkCallingWindow, formatClockTime } from "../calling-window";

export type PolicyDenyCode =
	| "LEAD_NOT_FOUND"
	| "INVALID_PHONE"
	| "LEAD_SUPPRESSED"
	| "ON_SUPPRESSION_LIST"
	| "NO_CONSENT"
	| "DND_REGISTERED"
	| "DND_SCRUB_STALE"
	| "OUTSIDE_CALLING_WINDOW"
	| "WEEKEND_BLOCKED"
	| "MAX_ATTEMPTS_REACHED"
	| "RETRY_TOO_SOON"
	| "CONCURRENCY_LIMIT"
	| "MONTHLY_CAP_REACHED"
	| "SETTINGS_MISSING";

export type CallPurpose = "PROMOTIONAL" | "TRANSACTIONAL" | "SERVICE";

export type PolicyDecision =
	| { allowed: true }
	| {
			allowed: false;
			code: PolicyDenyCode;
			/** Shown directly to the user in the console. */
			reason: string;
			/** When the block clears on its own, if it will. */
			retryAt: Date | null;
	  };

/** Statuses that occupy a concurrency slot. */
const ACTIVE_CALL_STATUSES = [
	"QUEUED",
	"DIALING",
	"RINGING",
	"IN_PROGRESS",
] as const;

export type OrgSettings = typeof organizationSettings.$inferSelect;

/**
 * Everything the policy needs, loaded once per request rather than per lead.
 * Keeping this separate from evaluation is what makes the engine both fast
 * (one round trip for a whole page) and testable (no database in unit tests).
 */
export type PolicyContext = {
	now: Date;
	settings: OrgSettings;
	/** Keyed by E.164. */
	suppression: Map<string, { reason: string; suppressedUntil: Date | null }>;
	dnd: Map<string, { isRegistered: boolean; expiresAt: Date }>;
	activeCalls: number;
	monthlyBillableSeconds: number;
};

const ALLOWED: PolicyDecision = { allowed: true };

function deny(
	code: PolicyDenyCode,
	reason: string,
	retryAt: Date | null = null,
): PolicyDecision {
	return { allowed: false, code, reason, retryAt };
}

/**
 * The single gate every outbound call passes through — pure, synchronous and
 * fully deterministic. No model, no prompt, no heuristics.
 *
 * Ordering matters: legal blocks (suppression, consent, DND) are evaluated
 * before operational ones (hours, attempts, capacity), so the reason shown to
 * the user is always the most consequential one.
 */
export function evaluatePolicy(
	ctx: PolicyContext,
	lead: Lead,
	purpose: CallPurpose = "SERVICE",
): PolicyDecision {
	const { now, settings } = ctx;
	const isPromotional = purpose === "PROMOTIONAL";

	if (!lead.phoneE164)
		return deny("INVALID_PHONE", "Lead has no valid phone number.");
	if (lead.status === "SUPPRESSED") {
		return deny(
			"LEAD_SUPPRESSED",
			"This lead has been suppressed and cannot be called.",
		);
	}

	// --- Suppression / do-not-call ---------------------------------------
	const suppressed = ctx.suppression.get(lead.phoneE164);
	if (suppressed) {
		const label = suppressed.reason.toLowerCase().replaceAll("_", " ");
		if (!suppressed.suppressedUntil) {
			return deny(
				"ON_SUPPRESSION_LIST",
				`Number is on the do-not-call list (${label}).`,
			);
		}
		if (suppressed.suppressedUntil > now) {
			const until = suppressed.suppressedUntil.toISOString().slice(0, 10);
			return deny(
				"ON_SUPPRESSION_LIST",
				`Number is suppressed until ${until} (${label}).`,
				suppressed.suppressedUntil,
			);
		}
	}

	// --- Consent ----------------------------------------------------------
	// Promotional calls require provable consent; service calls to an existing
	// customer do not. That is exactly why purpose and consent are modelled
	// separately rather than as one "can we call" boolean.
	if (isPromotional && lead.consentStatus !== "GRANTED") {
		return deny(
			"NO_CONSENT",
			"Promotional calls require recorded consent. This lead has none on file.",
		);
	}

	// --- National DND registry -------------------------------------------
	if (isPromotional) {
		const dnd = ctx.dnd.get(lead.phoneE164);
		// Fail closed: an expired scrub is not evidence of anything.
		if (!dnd || dnd.expiresAt <= now) {
			return deny(
				"DND_SCRUB_STALE",
				"Number has not been scrubbed against the DND registry recently. Re-scrub before calling.",
			);
		}
		if (dnd.isRegistered) {
			return deny(
				"DND_REGISTERED",
				"Number is registered on the national DND registry.",
			);
		}
	}

	// --- Calling window, in the LEAD's timezone ---------------------------
	const timeZone = lead.timezone || settings.defaultTimezone;
	const window = checkCallingWindow({
		instant: now,
		timeZone,
		windowStart: settings.callingWindowStart,
		windowEnd: settings.callingWindowEnd,
		allowWeekend: settings.allowWeekendCalls === 1,
	});

	if (!window.insideWindow) {
		const localTime = formatClockTime(window.localTime);
		if (window.isWeekend && settings.allowWeekendCalls !== 1) {
			return deny(
				"WEEKEND_BLOCKED",
				`Weekend calling is disabled. Local time is ${localTime} (${timeZone}).`,
				window.nextOpenAt,
			);
		}
		const from = settings.callingWindowStart.slice(0, 5);
		const to = settings.callingWindowEnd.slice(0, 5);
		return deny(
			"OUTSIDE_CALLING_WINDOW",
			`Outside calling hours ${from}-${to}. Local time is ${localTime} (${timeZone}).`,
			window.nextOpenAt,
		);
	}

	// --- Attempt limits ---------------------------------------------------
	if (lead.attemptCount >= settings.maxAttemptsPerLead) {
		return deny(
			"MAX_ATTEMPTS_REACHED",
			`Maximum ${settings.maxAttemptsPerLead} attempts already made for this lead.`,
		);
	}

	if (lead.nextEligibleAt && lead.nextEligibleAt > now) {
		return deny(
			"RETRY_TOO_SOON",
			`Minimum ${settings.minMinutesBetweenAttempts} minutes between attempts has not elapsed.`,
			lead.nextEligibleAt,
		);
	}

	// --- Capacity ---------------------------------------------------------
	if (ctx.activeCalls >= settings.maxConcurrentCalls) {
		return deny(
			"CONCURRENCY_LIMIT",
			`Workspace is already running ${ctx.activeCalls} of ${settings.maxConcurrentCalls} concurrent calls.`,
		);
	}

	if (ctx.monthlyBillableSeconds >= settings.monthlyMinutesCap * 60) {
		return deny(
			"MONTHLY_CAP_REACHED",
			`Monthly limit of ${settings.monthlyMinutesCap} minutes has been used.`,
		);
	}

	return ALLOWED;
}

/**
 * Loads policy context for a set of phone numbers in a fixed number of
 * queries, regardless of how many leads are being evaluated.
 */
export async function loadPolicyContext(
	// biome-ignore lint/suspicious/noExplicitAny: drizzle's inferred db type is not portable across packages
	db: any,
	input: { organizationId: string; phones: string[]; now?: Date },
): Promise<PolicyContext | null> {
	const now = input.now ?? new Date();
	const phones = [...new Set(input.phones.filter(Boolean))];

	const [settings] = await db
		.select()
		.from(organizationSettings)
		.where(eq(organizationSettings.organizationId, input.organizationId))
		.limit(1);

	if (!settings) return null;

	const suppression = new Map<
		string,
		{ reason: string; suppressedUntil: Date | null }
	>();
	const dnd = new Map<string, { isRegistered: boolean; expiresAt: Date }>();

	if (phones.length > 0) {
		const suppressionRows = await db
			.select()
			.from(suppressionEntry)
			.where(
				and(
					eq(suppressionEntry.organizationId, input.organizationId),
					inArray(suppressionEntry.phoneE164, phones),
				),
			);
		for (const row of suppressionRows) {
			suppression.set(row.phoneE164, {
				reason: row.reason,
				suppressedUntil: row.suppressedUntil ?? null,
			});
		}

		const dndRows = await db
			.select()
			.from(dndRegistryCache)
			.where(inArray(dndRegistryCache.phoneE164, phones));
		for (const row of dndRows) {
			dnd.set(row.phoneE164, {
				isRegistered: row.isRegistered,
				expiresAt: row.expiresAt,
			});
		}
	}

	const [activeRow] = await db
		.select({ activeCalls: sql<number>`cast(count(*) as int)` })
		.from(call)
		.where(
			and(
				eq(call.organizationId, input.organizationId),
				inArray(call.status, [...ACTIVE_CALL_STATUSES]),
			),
		);

	const monthStart = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
	);
	const [usageRow] = await db
		.select({
			seconds: sql<number>`cast(coalesce(sum(${call.billableSeconds}), 0) as int)`,
		})
		.from(call)
		.where(
			and(
				eq(call.organizationId, input.organizationId),
				gte(call.createdAt, monthStart),
			),
		);

	return {
		now,
		settings,
		suppression,
		dnd,
		activeCalls: activeRow?.activeCalls ?? 0,
		monthlyBillableSeconds: usageRow?.seconds ?? 0,
	};
}

export type CanCallInput = {
	organizationId: string;
	leadId: string;
	purpose?: CallPurpose;
	now?: Date;
};

/** Single-lead convenience wrapper around the bulk path. */
export async function canCall(
	// biome-ignore lint/suspicious/noExplicitAny: see above
	db: any,
	input: CanCallInput,
): Promise<{ decision: PolicyDecision; lead: Lead | null }> {
	const [lead] = (await db
		.select()
		.from(leadTable)
		.where(
			and(
				eq(leadTable.organizationId, input.organizationId),
				eq(leadTable.id, input.leadId),
			),
		)
		.limit(1)) as Lead[];

	if (!lead) {
		return {
			decision: deny("LEAD_NOT_FOUND", "Lead not found in this workspace."),
			lead: null,
		};
	}

	const ctx = await loadPolicyContext(db, {
		organizationId: input.organizationId,
		phones: [lead.phoneE164],
		now: input.now,
	});

	if (!ctx) {
		return {
			decision: deny(
				"SETTINGS_MISSING",
				"Workspace calling policy is not configured.",
			),
			lead,
		};
	}

	return { decision: evaluatePolicy(ctx, lead, input.purpose), lead };
}
