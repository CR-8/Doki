import { z } from "zod";

/** Mirrors the `sales_outcome` pg enum. Kept in sync deliberately. */
export const salesOutcomeSchema = z.enum([
	"UNKNOWN",
	"INTERESTED",
	"NOT_INTERESTED",
	"CALLBACK_REQUESTED",
	"QUALIFIED",
	"MEETING_BOOKED",
	"WRONG_NUMBER",
	"DO_NOT_CALL",
]);

export const objectionSchema = z.object({
	objection: z.string().max(300),
	handled: z.boolean(),
	quote: z.string().max(500).nullable().default(null),
});

/**
 * Contract for post-call analysis. This is a PROPOSAL from the model —
 * application code decides whether to promote `outcome` onto the call and lead.
 */
export const callAnalysisSchema = z.object({
	summary: z.string().min(1).max(1500),
	outcome: salesOutcomeSchema,
	objections: z.array(objectionSchema).max(10).default([]),
	qualification: z
		.object({
			budgetMentioned: z.boolean().default(false),
			timelineMentioned: z.boolean().default(false),
			decisionMaker: z.boolean().default(false),
			notes: z.string().max(600).nullable().default(null),
		})
		.default({
			budgetMentioned: false,
			timelineMentioned: false,
			decisionMaker: false,
			notes: null,
		}),
	nextAction: z.string().max(300).nullable().default(null),
	/** Relative scheduling — absolute timestamps are computed by our code. */
	nextActionInHours: z.number().int().min(0).max(2160).nullable().default(null),
	confidence: z.number().min(0).max(1),
	/**
	 * Set when the transcript shows the agent broke a rule, or the person asked
	 * not to be called again. `REQUESTED_OPT_OUT` triggers immediate suppression.
	 */
	guardrailFlags: z
		.array(
			z.enum([
				"REQUESTED_OPT_OUT",
				"QUOTED_PRICING",
				"CLAIMED_TO_BE_HUMAN",
				"MADE_COMMITMENT",
				"ABUSIVE_LANGUAGE",
				"WRONG_PERSON",
			]),
		)
		.max(6)
		.default([]),
});

export type CallAnalysisOutput = z.infer<typeof callAnalysisSchema>;

/** Compact lead context. Deliberately small — never send the whole CRM row. */
export type LeadContext = {
	name: string | null;
	company: string | null;
	status: string;
	previousCalls: number;
	lastSummary: string | null;
};

export function buildAnalysisSystemPrompt(): string {
	return [
		"You analyse sales call transcripts for an Indian B2B calling platform.",
		"Calls are often code-mixed Hindi/English (Hinglish); treat both as normal.",
		"",
		"Rules:",
		"- Report only what the transcript supports. Never invent details.",
		"- Speech-to-text is imperfect: names, numbers and emails may be garbled.",
		"  If a critical detail looks unreliable, lower `confidence` and say so in the summary.",
		"- `confidence` reflects how certain you are about `outcome`, not call quality.",
		"- Set REQUESTED_OPT_OUT if the person asked not to be contacted again, in any language.",
		"- Write the summary in English, under 120 words, plainly.",
		"",
		"Respond with JSON matching the provided schema. No prose outside the JSON.",
	].join("\n");
}

export function buildAnalysisUserPrompt(input: {
	objective: string;
	lead: LeadContext;
	transcript: string;
}): string {
	const { objective, lead, transcript } = input;
	return [
		`Campaign objective: ${objective}`,
		"",
		"Lead:",
		`- Name: ${lead.name ?? "unknown"}`,
		`- Company: ${lead.company ?? "unknown"}`,
		`- Current status: ${lead.status}`,
		`- Previous calls: ${lead.previousCalls}`,
		lead.lastSummary ? `- Last call summary: ${lead.lastSummary}` : "",
		"",
		"Transcript:",
		transcript.slice(0, 12000),
	]
		.filter(Boolean)
		.join("\n");
}
