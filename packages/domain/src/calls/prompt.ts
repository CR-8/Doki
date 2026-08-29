import type { Agent, Lead } from "@doki/db/schema";

/**
 * Renders `{{placeholders}}` in agent-authored copy.
 * Unknown keys are stripped rather than left visible to the caller.
 */
export function renderTemplate(
	template: string,
	values: Record<string, string | null | undefined>,
): string {
	return template
		.replace(
			/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
			(_match, key: string) => values[key] ?? "",
		)
		.replace(/\s{2,}/g, " ")
		.trim();
}

export class MissingDisclosureError extends Error {
	constructor() {
		super("Agent has no AI disclosure configured. Refusing to dial.");
		this.name = "MissingDisclosureError";
	}
}

/**
 * Builds the first thing the callee hears.
 *
 * The AI disclosure is not optional and not merely a prompt instruction — an
 * agent without one cannot be dialled at all. Several jurisdictions require
 * disclosing that the caller is automated, and a rule enforced only inside a
 * prompt is a rule the model can drift away from mid-call.
 */
export function buildFirstMessage(input: {
	agent: Agent;
	lead: Lead;
	businessName: string;
}): string {
	const { agent, lead, businessName } = input;

	const disclosure = renderTemplate(agent.aiDisclosure ?? "", {
		business_name: businessName,
		lead_name: lead.name ?? "",
		agent_name: agent.name,
	});

	if (!disclosure) throw new MissingDisclosureError();
	return disclosure;
}

/**
 * How the agent must write, given its configured language.
 *
 * This exists for the synthesiser, not for the reader. Bulbul is trained on
 * Devanagari for Hindi: romanised Hindi ("main bol rahi hoon") gets pronounced
 * as though it were English and comes out mangled, while the same sentence in
 * Devanagari ("मैं बोल रही हूँ") is read correctly.
 *
 * Code-mixed copy stays deliberately mixed — Hindi in Devanagari, English terms
 * in Latin — because that is both what Sarvam handles best and how an Indian
 * salesperson actually speaks. Transliterating "renewal" into Devanagari would
 * make it worse, not better.
 */
export function scriptDirective(language: string): string | null {
	const lang = language.toLowerCase();

	if (lang.startsWith("hi-en") || lang === "hinglish") {
		return [
			"Language and script:",
			'- Write Hindi words in Devanagari, never romanised. Write "मैं आपसे बात कर रही हूँ", never "main aapse baat kar rahi hoon".',
			'- Leave words that are normally said in English — product names, "renewal", "policy", "email" — in Latin script.',
			"- This is read aloud by a speech model that mispronounces romanised Hindi. The script you choose is the difference between sounding Indian and sounding broken.",
		].join("\n");
	}

	if (lang.startsWith("hi")) {
		return [
			"Language and script:",
			"- Write entirely in Hindi, in Devanagari. Never romanise Hindi.",
			"- Proper nouns and product names may stay in Latin script.",
			"- This is read aloud by a speech model that mispronounces romanised Hindi.",
		].join("\n");
	}

	if (lang.startsWith("en")) {
		return [
			"Language and script:",
			"- Write in Indian English. Plain words, no American idiom.",
		].join("\n");
	}

	return null;
}

/**
 * Assembles the live system prompt.
 *
 * Kept deliberately small: stable policy, the objective, a compact lead
 * profile and the FAQs. No CRM history, no prior transcripts — long prompts
 * cost latency on every turn, and latency is what makes a call sound broken.
 */
export function buildSystemPrompt(input: {
	agent: Agent;
	lead: Lead;
	businessName: string;
}): string {
	const { agent, lead, businessName } = input;
	const guardrails = agent.guardrails;

	const sections: string[] = [];

	sections.push(
		[
			`You are a voice agent calling on behalf of ${businessName}.`,
			`Objective: ${agent.objective}`,
			"",
			"Conversation rules:",
			`- Keep every reply under ${guardrails.maxWordsPerTurn} words. You are on a phone call, not writing.`,
			"- One question at a time. Let the person finish speaking.",
			"- Never repeat the greeting; it has already been spoken.",
		].join("\n"),
	);

	// Placed high, before the brief: the model follows a script instruction it
	// reads early far more reliably than one buried after the FAQs.
	const script = scriptDirective(agent.language);
	if (script) sections.push(script);

	// Hard behavioural limits. These are also checked after the call, so a
	// breach is visible in the analysis even if the model ignored them live.
	const hardRules: string[] = [];
	if (guardrails.mustAdmitAiIfAsked) {
		hardRules.push(
			"- If asked whether you are a human, say plainly that you are an AI assistant.",
		);
	}
	if (guardrails.neverQuotePricing) {
		hardRules.push(
			"- Never quote prices, discounts, or contract terms. Offer to have a colleague follow up instead.",
		);
	}
	hardRules.push("- Never promise anything you were not explicitly told here.");
	hardRules.push(
		"- If the person asks not to be contacted again, acknowledge it, confirm politely, and end the call.",
	);
	if (guardrails.forbiddenTopics.length > 0) {
		hardRules.push(
			`- Do not discuss: ${guardrails.forbiddenTopics.join(", ")}.`,
		);
	}
	if (guardrails.escalateOn.length > 0) {
		hardRules.push(
			`- If the conversation turns to ${guardrails.escalateOn.join(", ")}, offer a human callback and end.`,
		);
	}
	sections.push(`Hard rules (never break these):\n${hardRules.join("\n")}`);

	// Compact lead profile — only what changes the conversation.
	const profile = [
		lead.name ? `- Name: ${lead.name}` : null,
		lead.company ? `- Company: ${lead.company}` : null,
		lead.source ? `- Came from: ${lead.source}` : null,
		lead.attemptCount > 0
			? `- Previous call attempts: ${lead.attemptCount}`
			: null,
	].filter(Boolean);
	if (profile.length > 0)
		sections.push(`Who you are calling:\n${profile.join("\n")}`);

	sections.push(`Your brief:\n${agent.instructions}`);

	if (agent.faqs.length > 0) {
		const faqs = agent.faqs
			.slice(0, 12)
			.map((f) => `Q: ${f.question}\nA: ${f.answer}`)
			.join("\n\n");
		sections.push(
			`Answer these from the script, not from imagination:\n\n${faqs}`,
		);
	}

	sections.push(
		"If you do not know something, say you will have a colleague follow up. Never guess.",
	);

	return sections.join("\n\n");
}

/**
 * The complete spoken script for a one-way call.
 *
 * A telephony-only provider plays one audio file and hangs up — there is no
 * model in the loop to say anything after the greeting. Without a script the
 * callee hears the disclosure and a dial tone, which is what makes a demo call
 * look broken even though every part of the pipeline worked.
 *
 * The disclosure always leads. It is a legal requirement, and putting it
 * anywhere but first would let the pitch land before the person knows they are
 * talking to a machine.
 */
export function buildSpokenScript(input: {
	agent: Agent;
	lead: Lead;
	businessName: string;
}): string {
	const { agent, lead, businessName } = input;

	const vars = {
		business_name: businessName,
		lead_name: lead.name ?? "",
		agent_name: agent.name,
	};

	const disclosure = renderTemplate(agent.aiDisclosure ?? "", vars);
	if (!disclosure) throw new MissingDisclosureError();

	const body = renderTemplate(agent.callScript ?? "", vars).trim();
	if (!body) return disclosure;

	// Joined with a space; the synthesiser handles sentence pacing from the
	// punctuation, and an explicit pause here would be read as a gap.
	return `${disclosure} ${body}`;
}
