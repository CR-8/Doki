import { buildFirstMessage, buildSpokenScript } from "../src/calls/prompt";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
	console.log(
		`${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
	);
	if (!ok) failures++;
}

const base = {
	name: "Renewal",
	objective: "Confirm renewal",
	instructions: "Be warm.",
	aiDisclosure: "नमस्ते, मैं {{business_name}} की AI assistant बोल रही हूँ।",
	callScript: "{{lead_name}} जी, आपकी policy का renewal इस महीने due है।",
	language: "hi-en",
	faqs: [],
	guardrails: {
		forbiddenTopics: [],
		neverQuotePricing: true,
		mustAdmitAiIfAsked: true,
		escalateOn: [],
		maxWordsPerTurn: 45,
	},
	// biome-ignore lint/suspicious/noExplicitAny: fixture, not a full row
} as any;

// biome-ignore lint/suspicious/noExplicitAny: fixture, not a full row
const lead = { name: "Pratyush", attemptCount: 0 } as any;
const businessName = "Vivax";

const spoken = buildSpokenScript({ agent: base, lead, businessName });
const greeting = buildFirstMessage({ agent: base, lead, businessName });

console.log(`\ndisclosure only : "${greeting}"`);
console.log(`full script     : "${spoken}"\n`);

check("disclosure leads the script", spoken.startsWith("नमस्ते"));
check("the body follows it", spoken.includes("renewal इस महीने due"));
check("placeholders render in the body", spoken.includes("Pratyush जी"));
check(
	"the script is longer than the greeting",
	spoken.length > greeting.length,
);
check(
	"a conversational provider still gets only the greeting",
	greeting === "नमस्ते, मैं Vivax की AI assistant बोल रही हूँ।",
);

// This is the bug that shipped: no script meant the call said one line.
const scriptless = buildSpokenScript({
	agent: { ...base, callScript: null },
	lead,
	businessName,
});
check("no script falls back to the disclosure", scriptless === greeting);

console.log(
	failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
