/**
 * Pre-call readiness check.
 *
 * Answers "why is my call not going out?" without spending a call to find out.
 * Every check reports the specific thing to fix rather than a generic failure,
 * because the failures here are almost always configuration, not code.
 *
 *   cd apps/web && bun run preflight
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

type Level = "ok" | "warn" | "fail";
type Result = { level: Level; label: string; detail?: string; fix?: string };

const results: Result[] = [];
const ok = (label: string, detail?: string) =>
	results.push({ level: "ok", label, detail });
const warn = (label: string, detail?: string, fix?: string) =>
	results.push({ level: "warn", label, detail, fix });
const fail = (label: string, detail?: string, fix?: string) =>
	results.push({ level: "fail", label, detail, fix });

const env = process.env;

// ---------------------------------------------------------------- app URL ---
const appUrl = env.APP_URL ?? "";
const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(appUrl);

if (!appUrl) {
	fail("APP_URL", "not set", "Set APP_URL to your public tunnel URL.");
} else if (isLocal) {
	fail(
		"APP_URL",
		`${appUrl} — a carrier cannot reach localhost`,
		"Run: npx untun@latest tunnel http://localhost:3001, then set APP_URL to the tunnel URL.",
	);
} else if (!appUrl.startsWith("https://")) {
	warn(
		"APP_URL",
		`${appUrl} is not https`,
		"Twilio requires https for media URLs.",
	);
} else {
	ok("APP_URL", appUrl);
}

// -------------------------------------------------------------- provider ----
const provider = env.VOICE_PROVIDER ?? "mock";
if (provider === "mock") {
	warn(
		"VOICE_PROVIDER",
		"mock — call rows are written but no phone is ever dialled",
		"Set VOICE_PROVIDER=twilio (or vapi) to place real calls.",
	);
} else {
	ok("VOICE_PROVIDER", provider);
}

// ---------------------------------------------------------------- Twilio ----
async function checkTwilio(): Promise<void> {
	const sid = env.TWILIO_ACCOUNT_SID;
	const token = env.TWILIO_AUTH_TOKEN;
	const from = env.TWILIO_FROM_NUMBER;

	if (!sid || !token || !from) {
		fail(
			"Twilio credentials",
			"missing one of TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER",
		);
		return;
	}

	const auth = `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
	const api = "https://api.twilio.com/2010-04-01";

	let isTrial = false;
	try {
		const res = await fetch(`${api}/Accounts/${sid}.json`, {
			headers: { authorization: auth },
		});
		if (res.status === 401) {
			fail(
				"Twilio auth",
				"401 — credentials rejected",
				"Check the auth token.",
			);
			return;
		}
		if (!res.ok) {
			fail("Twilio auth", `HTTP ${res.status}`);
			return;
		}
		const account = (await res.json()) as { status?: string; type?: string };
		isTrial = account.type === "Trial";
		ok("Twilio auth", `account ${account.status}, type ${account.type}`);
	} catch (error) {
		fail("Twilio auth", error instanceof Error ? error.message : String(error));
		return;
	}

	// The caller ID must be a number this account actually owns.
	try {
		const res = await fetch(
			`${api}/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(from)}`,
			{ headers: { authorization: auth } },
		);
		const body = (await res.json()) as {
			incoming_phone_numbers?: {
				phone_number?: string;
				capabilities?: { voice?: boolean };
			}[];
		};
		const match = body.incoming_phone_numbers?.[0];
		if (!match) {
			fail(
				"Twilio from-number",
				`${from} is not owned by this account`,
				"Buy or verify the number in the Twilio console.",
			);
		} else if (match.capabilities?.voice === false) {
			fail("Twilio from-number", `${from} has no voice capability`);
		} else {
			ok("Twilio from-number", `${from} owned, voice enabled`);
		}
	} catch (error) {
		warn(
			"Twilio from-number",
			error instanceof Error ? error.message : String(error),
		);
	}

	// Trial accounts silently refuse unverified destinations.
	if (isTrial) {
		try {
			const res = await fetch(`${api}/Accounts/${sid}/OutgoingCallerIds.json`, {
				headers: { authorization: auth },
			});
			const body = (await res.json()) as {
				outgoing_caller_ids?: { phone_number?: string }[];
			};
			const verified = (body.outgoing_caller_ids ?? [])
				.map((c) => c.phone_number)
				.filter(Boolean) as string[];

			if (verified.length === 0) {
				fail(
					"Twilio trial restriction",
					"no verified numbers — a trial account can only call verified destinations",
					"Verify your own mobile in Twilio console > Phone Numbers > Verified Caller IDs.",
				);
			} else {
				warn(
					"Twilio trial restriction",
					`can only call: ${verified.join(", ")}`,
					"Any other destination will be rejected by Twilio.",
				);
			}
		} catch {
			warn("Twilio trial restriction", "could not list verified numbers");
		}
	}
}

// ---------------------------------------------------------------- Sarvam ----
async function checkSarvam(): Promise<void> {
	const key = env.SARVAM_API_KEY;
	if (!key) {
		fail(
			"Sarvam TTS",
			"SARVAM_API_KEY not set",
			"Speech synthesis is required to dial.",
		);
		return;
	}
	try {
		const res = await fetch("https://api.sarvam.ai/text-to-speech", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"api-subscription-key": key,
			},
			body: JSON.stringify({
				text: "Namaste.",
				language_code: "hi-IN",
				model: env.SARVAM_TTS_MODEL ?? "bulbul:v2",
				speaker: env.SARVAM_TTS_SPEAKER ?? "anushka",
				output_audio_codec: "mp3",
			}),
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			fail("Sarvam TTS", `HTTP ${res.status}: ${body.slice(0, 160)}`);
			return;
		}
		const payload = (await res.json()) as { audios?: string[] };
		if (!payload.audios?.[0]) {
			fail("Sarvam TTS", "responded without audio");
			return;
		}
		ok(
			"Sarvam TTS",
			`${env.SARVAM_TTS_MODEL ?? "bulbul:v2"} / ${env.SARVAM_TTS_SPEAKER ?? "anushka"}`,
		);
	} catch (error) {
		fail("Sarvam TTS", error instanceof Error ? error.message : String(error));
	}
}

// -------------------------------------------------------------------- LLM ---
function checkLlm(): void {
	if (!env.OPENAI_API_KEY) {
		warn(
			"Post-call analysis",
			"OPENAI_API_KEY not set — calls will work, analysis will be skipped",
		);
	} else {
		ok("Post-call analysis", env.LLM_MODEL ?? "gpt-4o-mini");
	}
}

// ------------------------------------------------------------- workspace ----
async function checkWorkspace(): Promise<void> {
	const { db } = await import("@doki/db");
	const { agent, organization, organizationSettings } = await import(
		"@doki/db/schema"
	);
	const { eq } = await import("drizzle-orm");

	const orgs = await db
		.select({ id: organization.id, name: organization.name })
		.from(organization);
	if (orgs.length === 0) {
		fail("Workspace", "none exists", "Sign in and create a workspace first.");
		return;
	}
	ok("Workspace", orgs.map((o) => o.name).join(", "));

	for (const org of orgs) {
		const [settings] = await db
			.select()
			.from(organizationSettings)
			.where(eq(organizationSettings.organizationId, org.id))
			.limit(1);

		if (!settings) {
			warn(
				`Policy (${org.name})`,
				"not initialised",
				"Open /leads once to create defaults.",
			);
		} else {
			ok(
				`Policy (${org.name})`,
				`${settings.callingWindowStart.slice(0, 5)}-${settings.callingWindowEnd.slice(0, 5)} ${settings.defaultTimezone}, max ${settings.maxConcurrentCalls} concurrent`,
			);
		}

		const agents = await db
			.select({
				name: agent.name,
				status: agent.status,
				disclosure: agent.aiDisclosure,
			})
			.from(agent)
			.where(eq(agent.organizationId, org.id));

		const active = agents.filter((a) => a.status === "ACTIVE");
		if (active.length === 0) {
			fail(
				`Agent (${org.name})`,
				"no ACTIVE agent",
				"Create one at /agents — dispatch needs an agent to speak.",
			);
		} else if (active.some((a) => !a.disclosure?.trim())) {
			fail(`Agent (${org.name})`, "an active agent has a blank AI disclosure");
		} else {
			ok(`Agent (${org.name})`, active.map((a) => a.name).join(", "));
		}
	}
}

// ------------------------------------------------------------------- run ----
console.log(`\nCallwise preflight\n${"=".repeat(60)}`);

try {
	await checkWorkspace();
} catch (error) {
	fail("Database", error instanceof Error ? error.message : String(error));
}

if (provider === "twilio") await checkTwilio();
await checkSarvam();
checkLlm();

const ICON: Record<Level, string> = {
	ok: "  OK  ",
	warn: " WARN ",
	fail: " FAIL ",
};

console.log("");
for (const r of results) {
	console.log(
		`[${ICON[r.level]}] ${r.label}${r.detail ? ` — ${r.detail}` : ""}`,
	);
	if (r.fix) console.log(`          -> ${r.fix}`);
}

const failures = results.filter((r) => r.level === "fail").length;
const warnings = results.filter((r) => r.level === "warn").length;

console.log(`\n${"=".repeat(60)}`);
if (failures > 0) {
	console.log(
		`${failures} blocking issue(s), ${warnings} warning(s). Calls will NOT go out.`,
	);
} else if (warnings > 0) {
	console.log(`Ready, with ${warnings} warning(s).`);
} else {
	console.log("Ready to place calls.");
}
console.log("");

process.exit(failures > 0 ? 1 : 0);
