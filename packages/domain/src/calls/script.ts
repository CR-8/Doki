import type { Agent } from "@doki/db/schema";
import { z } from "zod";

import { scriptDirective } from "./prompt";

/**
 * What the model is allowed to return.
 *
 * Schema-validated like every other AI output here: the script is spoken to a
 * real person on a recorded, regulated call, so "roughly the right shape" is
 * not good enough. The disclosure is deliberately NOT part of this — it is
 * prepended by deterministic code, so the model cannot reword, soften, or drop
 * the one sentence that is legally required.
 */
export const callScriptSchema = z.object({
	/** The spoken body, after the disclosure. */
	script: z
		.string()
		.trim()
		.min(20, "Too short to be a usable call script")
		.max(1200)
		// Enforced rather than merely requested. Models keep writing questions
		// into one-way scripts because that is what a sales call sounds like in
		// their training data — but nobody is listening for an answer, and a
		// question followed by a hangup is worse than saying nothing.
		.refine(
			(text) => !text.includes("?"),
			"A one-way call cannot ask questions — the call ends as soon as the script finishes. State what happens next instead.",
		),
	/** One line on the approach taken, shown to the user before they accept it. */
	rationale: z.string().trim().max(300),
});

export type CallScript = z.infer<typeof callScriptSchema>;

const SYSTEM = [
	"You write short scripts for automated outbound phone calls in India.",
	"",
	"The script is read aloud by a speech synthesiser and then the call ends.",
	"There is no conversation: the person cannot reply, and nothing you write",
	"will be followed up on the call itself. Write accordingly.",
	"",
	"Rules:",
	"- 30 to 70 words. A recorded call longer than about 25 seconds gets hung up on.",
	"- Do NOT greet or introduce yourself. A disclosure has already been spoken;",
	"  your text continues directly from it.",
	"- NEVER ask a question. Nobody can answer — the call ends the instant you",
	"  stop speaking. Do not say 'would you like', 'can you confirm', or anything",
	"  expecting a reply. Make statements only.",
	"- Say why you are calling, give the one useful piece of information, and end",
	"  by stating what happens next — normally that a colleague will call back.",
	"- Address the person with {{lead_name}} where it reads naturally. It is",
	"  substituted before the call; write the placeholder exactly.",
	"- Never quote prices, discounts, or contract terms.",
	"- Never promise anything not given to you in the brief.",
	"- Plain spoken sentences. No bullet points, no markdown, no stage directions,",
	"  no emoji. Punctuation only as a speaker would pause.",
].join("\n");

/**
 * Prompt for drafting a one-way call script.
 *
 * Separate from the conversational system prompt because the constraints are
 * opposite: that one tells a model how to react, this one asks for finished
 * copy that no one will adapt after it is written.
 */
export function buildScriptPrompt(input: {
	agent: Agent;
	businessName: string;
}): { system: string; user: string } {
	const { agent, businessName } = input;

	const parts = [
		`Business: ${businessName}`,
		`Objective of the call: ${agent.objective}`,
		"",
		"Brief from the customer:",
		agent.instructions,
	];

	if (agent.faqs.length > 0) {
		parts.push(
			"",
			"Facts you may state (do not invent others):",
			...agent.faqs.slice(0, 6).map((f) => `- ${f.question} — ${f.answer}`),
		);
	}

	if (agent.guardrails.neverQuotePricing) {
		parts.push("", "Pricing must not be mentioned.");
	}

	const directive = scriptDirective(agent.language);
	if (directive) parts.push("", directive);

	parts.push(
		"",
		`For reference, the disclosure already spoken is: "${agent.aiDisclosure}"`,
		"Continue naturally from it. Do not repeat it.",
	);

	return { system: SYSTEM, user: parts.join("\n") };
}
