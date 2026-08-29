import { buildSystemPrompt, scriptDirective } from "../src/calls/prompt";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
	console.log(
		`${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
	);
	if (!ok) failures++;
}

check(
	"hinglish asks for Devanagari",
	scriptDirective("hi-en")?.includes("Devanagari") === true,
);
check(
	"hinglish keeps English terms in Latin",
	scriptDirective("hi-en")?.includes("Latin script") === true,
);
check(
	"pure hindi forbids romanisation",
	scriptDirective("hi-IN")?.includes("Never romanise") === true,
);
check(
	"english gets no Devanagari instruction",
	scriptDirective("en-IN")?.includes("Devanagari") !== true,
);
check("unknown language yields nothing", scriptDirective("fr-FR") === null);

// The directive has to reach the assembled prompt, not just exist.
const agent = {
	name: "Renewal",
	objective: "Confirm the renewal date",
	instructions: "Be warm and brief.",
	aiDisclosure: "नमस्ते",
	language: "hi-en",
	maxCallSeconds: 300,
	voiceId: null,
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
const lead = { name: "Ayush", company: "Vivax", attemptCount: 0 } as any;
const prompt = buildSystemPrompt({ agent, lead, businessName: "Vivax" });

check("prompt carries the script directive", prompt.includes("Devanagari"));
check(
	"directive appears before the brief",
	prompt.indexOf("Language and script:") < prompt.indexOf("Your brief:"),
);
check(
	"the stale 'code-mixed is fine' line is gone",
	!prompt.includes("Code-mixed Hindi/English is normal"),
);

const english = buildSystemPrompt({
	agent: { ...agent, language: "en-IN" },
	lead,
	businessName: "Vivax",
});
check("english prompt has no Devanagari rule", !english.includes("Devanagari"));

console.log(
	failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
