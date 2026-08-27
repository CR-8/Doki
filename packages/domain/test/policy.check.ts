import type { Lead } from "@doki/db/schema";

import { checkCallingWindow } from "../src/calling-window";
import { normalizePhone } from "../src/phone";
import { evaluatePolicy, type PolicyContext } from "../src/policy/can-call";

let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (ok) {
		pass++;
		console.log(`  ok   ${label}`);
	} else {
		fail++;
		console.log(
			`  FAIL ${label}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`,
		);
	}
}

// --- Phone normalisation -------------------------------------------------
console.log("\nPhone normalisation (all must collapse to one E.164):");
for (const raw of [
	"98765 43210",
	"+91-9876543210",
	"09876543210",
	"919876543210",
	"+919876543210",
]) {
	const r = normalizePhone(raw);
	check(`"${raw}"`, r.ok ? r.e164 : r.reason, "+919876543210");
}
check('rejects "12"', normalizePhone("12").ok, false);

// --- Calling window ------------------------------------------------------
console.log("\nCalling window (09:00-21:00 Asia/Kolkata):");
const win = (iso: string) =>
	checkCallingWindow({
		instant: new Date(iso),
		timeZone: "Asia/Kolkata",
		windowStart: "09:00:00",
		windowEnd: "21:00:00",
		allowWeekend: false,
	});

// 2026-08-26 is a Wednesday. IST = UTC+5:30.
check(
	"14:30 IST Wed -> inside",
	win("2026-08-26T09:00:00Z").insideWindow,
	true,
);
check(
	"08:59 IST Wed -> outside",
	win("2026-08-26T03:29:00Z").insideWindow,
	false,
);
check(
	"21:30 IST Wed -> outside",
	win("2026-08-26T16:00:00Z").insideWindow,
	false,
);
check(
	"09:01 IST Wed -> inside",
	win("2026-08-26T03:31:00Z").insideWindow,
	true,
);
// 2026-08-29 is a Saturday.
check(
	"14:30 IST Sat -> weekend blocked",
	win("2026-08-29T09:00:00Z").insideWindow,
	false,
);
check("Sat flagged isWeekend", win("2026-08-29T09:00:00Z").isWeekend, true);

// A lead in New York must be judged in NEW YORK's clock, not the server's.
const nyMidnight = checkCallingWindow({
	instant: new Date("2026-08-26T04:00:00Z"), // 00:00 EDT
	timeZone: "America/New_York",
	windowStart: "09:00:00",
	windowEnd: "21:00:00",
	allowWeekend: false,
});
check("00:00 New York -> outside", nyMidnight.insideWindow, false);
check(
	"next open is in the future",
	(nyMidnight.nextOpenAt?.getTime() ?? 0) >
		new Date("2026-08-26T04:00:00Z").getTime(),
	true,
);

// --- Policy engine -------------------------------------------------------
console.log("\nPolicy gate:");

const settings = {
	organizationId: "org_1",
	callingWindowStart: "09:00:00",
	callingWindowEnd: "21:00:00",
	defaultTimezone: "Asia/Kolkata",
	allowWeekendCalls: 0,
	dltEntityId: null,
	registeredCallerId: null,
	defaultCallPurpose: "SERVICE" as const,
	maxAttemptsPerLead: 3,
	minMinutesBetweenAttempts: 240,
	optOutFreezeDays: 90,
	maxConcurrentCalls: 3,
	monthlyMinutesCap: 1000,
	createdAt: new Date(),
	updatedAt: new Date(),
};

// Wednesday 14:30 IST — comfortably inside the window.
const NOW = new Date("2026-08-26T09:00:00Z");

function ctx(overrides: Partial<PolicyContext> = {}): PolicyContext {
	return {
		now: NOW,
		settings,
		suppression: new Map(),
		dnd: new Map(),
		activeCalls: 0,
		monthlyBillableSeconds: 0,
		...overrides,
	};
}

function mkLead(overrides: Partial<Lead> = {}): Lead {
	return {
		id: "lead_1",
		organizationId: "org_1",
		name: "Rohan",
		company: null,
		email: null,
		phoneRaw: "9876543210",
		phoneE164: "+919876543210",
		phoneCountry: "IN",
		status: "NEW",
		source: null,
		externalId: null,
		ownerId: null,
		timezone: "Asia/Kolkata",
		consentStatus: "UNKNOWN",
		consentSource: null,
		consentAt: null,
		consentEvidence: null,
		consentAttestedBy: null,
		attemptCount: 0,
		lastAttemptAt: null,
		nextEligibleAt: null,
		customFields: {},
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	} as Lead;
}

const code = (d: ReturnType<typeof evaluatePolicy>) =>
	d.allowed ? "ALLOWED" : d.code;

check(
	"service call to unknown-consent lead -> allowed",
	code(evaluatePolicy(ctx(), mkLead(), "SERVICE")),
	"ALLOWED",
);
check(
	"promotional without consent -> NO_CONSENT",
	code(evaluatePolicy(ctx(), mkLead(), "PROMOTIONAL")),
	"NO_CONSENT",
);

check(
	"promotional with consent but no DND scrub -> DND_SCRUB_STALE",
	code(
		evaluatePolicy(ctx(), mkLead({ consentStatus: "GRANTED" }), "PROMOTIONAL"),
	),
	"DND_SCRUB_STALE",
);

const freshDnd = new Map([
	[
		"+919876543210",
		{ isRegistered: false, expiresAt: new Date("2026-09-30T00:00:00Z") },
	],
]);
check(
	"promotional, consent + clean fresh scrub -> allowed",
	code(
		evaluatePolicy(
			ctx({ dnd: freshDnd }),
			mkLead({ consentStatus: "GRANTED" }),
			"PROMOTIONAL",
		),
	),
	"ALLOWED",
);

const registeredDnd = new Map([
	[
		"+919876543210",
		{ isRegistered: true, expiresAt: new Date("2026-09-30T00:00:00Z") },
	],
]);
check(
	"promotional to DND-registered number -> DND_REGISTERED",
	code(
		evaluatePolicy(
			ctx({ dnd: registeredDnd }),
			mkLead({ consentStatus: "GRANTED" }),
			"PROMOTIONAL",
		),
	),
	"DND_REGISTERED",
);

const suppression = new Map([
	["+919876543210", { reason: "USER_OPT_OUT", suppressedUntil: null }],
]);
check(
	"opted-out number -> ON_SUPPRESSION_LIST even for SERVICE",
	code(evaluatePolicy(ctx({ suppression }), mkLead(), "SERVICE")),
	"ON_SUPPRESSION_LIST",
);
check(
	"suppression outranks consent",
	code(
		evaluatePolicy(
			ctx({ suppression, dnd: freshDnd }),
			mkLead({ consentStatus: "GRANTED" }),
			"PROMOTIONAL",
		),
	),
	"ON_SUPPRESSION_LIST",
);

const expiredSuppression = new Map([
	[
		"+919876543210",
		{
			reason: "USER_OPT_OUT",
			suppressedUntil: new Date("2026-01-01T00:00:00Z"),
		},
	],
]);
check(
	"expired suppression no longer blocks",
	code(
		evaluatePolicy(
			ctx({ suppression: expiredSuppression }),
			mkLead(),
			"SERVICE",
		),
	),
	"ALLOWED",
);

check(
	"outside hours -> OUTSIDE_CALLING_WINDOW",
	code(
		evaluatePolicy(
			ctx({ now: new Date("2026-08-26T18:00:00Z") }),
			mkLead(),
			"SERVICE",
		),
	),
	"OUTSIDE_CALLING_WINDOW",
);
check(
	"weekend -> WEEKEND_BLOCKED",
	code(
		evaluatePolicy(
			ctx({ now: new Date("2026-08-29T09:00:00Z") }),
			mkLead(),
			"SERVICE",
		),
	),
	"WEEKEND_BLOCKED",
);
check(
	"attempts exhausted -> MAX_ATTEMPTS_REACHED",
	code(evaluatePolicy(ctx(), mkLead({ attemptCount: 3 }), "SERVICE")),
	"MAX_ATTEMPTS_REACHED",
);
check(
	"retry cooldown -> RETRY_TOO_SOON",
	code(
		evaluatePolicy(
			ctx(),
			mkLead({ nextEligibleAt: new Date("2026-08-27T00:00:00Z") }),
			"SERVICE",
		),
	),
	"RETRY_TOO_SOON",
);
check(
	"at concurrency cap -> CONCURRENCY_LIMIT",
	code(evaluatePolicy(ctx({ activeCalls: 3 }), mkLead(), "SERVICE")),
	"CONCURRENCY_LIMIT",
);
check(
	"monthly quota spent -> MONTHLY_CAP_REACHED",
	code(
		evaluatePolicy(
			ctx({ monthlyBillableSeconds: 60_000 }),
			mkLead(),
			"SERVICE",
		),
	),
	"MONTHLY_CAP_REACHED",
);
check(
	"lead marked SUPPRESSED -> LEAD_SUPPRESSED",
	code(evaluatePolicy(ctx(), mkLead({ status: "SUPPRESSED" }), "SERVICE")),
	"LEAD_SUPPRESSED",
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
