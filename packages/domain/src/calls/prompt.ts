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
			"- Speak naturally in the caller's language. Code-mixed Hindi/English is normal and fine.",
			"- Never repeat the greeting; it has already been spoken.",
		].join("\n"),
	);

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
