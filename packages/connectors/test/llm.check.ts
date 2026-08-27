import { OpenAiLlmProvider } from "../src/llm/openai";
import { callAnalysisSchema } from "../src/llm/schemas";
import { LlmProviderError, LlmValidationError } from "../src/llm/types";

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

const realFetch = globalThis.fetch;

/** Serves canned completion bodies in order, counting calls. */
function stubFetch(bodies: string[], status = 200) {
	let calls = 0;
	globalThis.fetch = (async () => {
		const body = bodies[Math.min(calls, bodies.length - 1)];
		calls++;
		if (status !== 200) {
			return new Response("upstream exploded", { status });
		}
		return new Response(
			JSON.stringify({
				choices: [{ message: { content: body } }],
				usage: { prompt_tokens: 100, completion_tokens: 50 },
			}),
			{ status: 200, headers: { "content-type": "application/json" } },
		);
	}) as typeof fetch;
	return () => calls;
}

const VALID = JSON.stringify({
	summary: "Prospect asked for a callback next week.",
	outcome: "CALLBACK_REQUESTED",
	objections: [],
	qualification: {
		budgetMentioned: false,
		timelineMentioned: true,
		decisionMaker: true,
		notes: null,
	},
	nextAction: "Call back Tuesday",
	nextActionInHours: 120,
	confidence: 0.82,
	guardrailFlags: [],
});

const provider = new OpenAiLlmProvider({
	apiKey: "test-key",
	defaultModel: "test-model",
});

function request() {
	return {
		system: "analyse",
		messages: [{ role: "user" as const, content: "transcript" }],
		schema: callAnalysisSchema,
		schemaName: "call_analysis",
	};
}

console.log("\nSchema contract:");
{
	const ok = callAnalysisSchema.safeParse(JSON.parse(VALID));
	check("valid payload accepted", ok.success, true);

	const badEnum = callAnalysisSchema.safeParse({
		...JSON.parse(VALID),
		outcome: "DEFINITELY_BUYING",
	});
	check("invented outcome rejected", badEnum.success, false);

	const badConfidence = callAnalysisSchema.safeParse({
		...JSON.parse(VALID),
		confidence: 4,
	});
	check("confidence out of range rejected", badConfidence.success, false);

	const badFlag = callAnalysisSchema.safeParse({
		...JSON.parse(VALID),
		guardrailFlags: ["MADE_UP_FLAG"],
	});
	check("unknown guardrail flag rejected", badFlag.success, false);

	const minimal = callAnalysisSchema.safeParse({
		summary: "Short call.",
		outcome: "UNKNOWN",
		confidence: 0.1,
	});
	check("optional fields default", minimal.success, true);
	check(
		"objections defaults to []",
		minimal.success ? minimal.data.objections : null,
		[],
	);
}

console.log("\nProvider behaviour:");
try {
	{
		const calls = stubFetch([VALID]);
		const result = await provider.generateStructured(request());
		check("valid response parsed", result.data.outcome, "CALLBACK_REQUESTED");
		check("usage captured", result.usage, {
			inputTokens: 100,
			outputTokens: 50,
		});
		check("single request made", calls(), 1);
	}

	{
		// First reply is not JSON at all — the provider must re-ask, not crash.
		const calls = stubFetch(["I think they were interested!", VALID]);
		const result = await provider.generateStructured(request());
		check(
			"recovers from non-JSON reply",
			result.data.outcome,
			"CALLBACK_REQUESTED",
		);
		check("repair attempt made", calls(), 2);
	}

	{
		// Well-formed JSON that violates the contract must still be rejected.
		const invalid = JSON.stringify({
			summary: "x",
			outcome: "MAYBE",
			confidence: 0.9,
		});
		stubFetch([invalid]);
		let threw = "";
		try {
			await provider.generateStructured(request());
		} catch (error) {
			threw =
				error instanceof LlmValidationError
					? "LlmValidationError"
					: String(error);
		}
		check("schema-violating JSON rejected", threw, "LlmValidationError");
	}

	{
		stubFetch(["{}"], 500);
		let kind = "";
		let retryable: boolean | null = null;
		try {
			await provider.generateStructured(request());
		} catch (error) {
			kind =
				error instanceof LlmProviderError ? "LlmProviderError" : String(error);
			retryable = error instanceof LlmProviderError ? error.retryable : null;
		}
		check("upstream 500 surfaces as provider error", kind, "LlmProviderError");
		check("500 marked retryable", retryable, true);
	}
} finally {
	globalThis.fetch = realFetch;
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
