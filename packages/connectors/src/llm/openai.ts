import { z } from "zod";

import {
	type LlmProvider,
	LlmProviderError,
	LlmValidationError,
	type StructuredRequest,
	type StructuredResult,
} from "./types";

type OpenAiConfig = {
	apiKey: string;
	defaultModel: string;
	baseUrl?: string;
	/** How many times to re-ask the model after a schema violation. */
	maxRepairAttempts?: number;
};

/** OpenAI rejects `$schema`; strip keys the API does not accept. */
function toApiJsonSchema(schema: z.ZodType): Record<string, unknown> {
	const json = z.toJSONSchema(schema, { io: "output" }) as Record<
		string,
		unknown
	>;
	const { $schema: _drop, ...rest } = json;
	return rest;
}

/**
 * Works against any OpenAI-compatible chat completions endpoint. Uses plain
 * fetch rather than the vendor SDK so swapping the base URL is enough to point
 * at a different provider — including a self-hosted vLLM/Ollama gateway later.
 */
export class OpenAiLlmProvider implements LlmProvider {
	readonly name = "openai";
	private readonly baseUrl: string;
	private readonly maxRepairAttempts: number;

	constructor(private readonly config: OpenAiConfig) {
		this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
		this.maxRepairAttempts = config.maxRepairAttempts ?? 1;
	}

	async generateStructured<TSchema extends z.ZodType>(
		req: StructuredRequest<TSchema>,
	): Promise<StructuredResult<TSchema>> {
		const model = req.model ?? this.config.defaultModel;
		const jsonSchema = toApiJsonSchema(req.schema);

		const messages = [
			{ role: "system" as const, content: req.system },
			...req.messages.map((m) => ({ role: m.role, content: m.content })),
		];

		let lastRaw: unknown;
		let lastIssues: unknown;

		for (let attempt = 0; attempt <= this.maxRepairAttempts; attempt++) {
			const body = {
				model,
				messages:
					attempt === 0
						? messages
						: [
								...messages,
								{
									role: "system" as const,
									content:
										"Your previous response did not match the required schema. " +
										`Validation errors: ${JSON.stringify(lastIssues)}. ` +
										"Respond again with valid JSON only.",
								},
							],
				temperature: req.temperature ?? 0.2,
				max_tokens: req.maxOutputTokens ?? 800,
				response_format: {
					type: "json_schema",
					json_schema: {
						name: req.schemaName,
						schema: jsonSchema,
						strict: false,
					},
				},
			};

			const res = await fetch(`${this.baseUrl}/chat/completions`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${this.config.apiKey}`,
				},
				body: JSON.stringify(body),
			});

			if (!res.ok) {
				const text = await res.text().catch(() => "");
				throw new LlmProviderError(
					`LLM request failed (${res.status}): ${text.slice(0, 500)}`,
					res.status,
					res.status === 429 || res.status >= 500,
				);
			}

			const payload = (await res.json()) as {
				choices?: Array<{ message?: { content?: string } }>;
				usage?: { prompt_tokens?: number; completion_tokens?: number };
			};

			const content = payload.choices?.[0]?.message?.content;
			if (!content) {
				throw new LlmProviderError(
					"LLM returned an empty response",
					res.status,
					true,
				);
			}

			// Never trust JSON.parse alone — parse, then validate against the contract.
			let parsed: unknown;
			try {
				parsed = JSON.parse(content);
			} catch {
				lastRaw = content;
				lastIssues = "response was not valid JSON";
				continue;
			}

			const result = req.schema.safeParse(parsed);
			if (result.success) {
				return {
					data: result.data,
					usage: {
						inputTokens: payload.usage?.prompt_tokens ?? 0,
						outputTokens: payload.usage?.completion_tokens ?? 0,
					},
					model,
					raw: parsed,
				};
			}

			lastRaw = parsed;
			lastIssues = result.error.issues;
		}

		throw new LlmValidationError(
			"LLM output failed schema validation after repair attempts",
			lastRaw,
			lastIssues,
		);
	}
}
