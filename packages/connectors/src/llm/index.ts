import { env } from "@doki/env/server";

import { OpenAiLlmProvider } from "./openai";
import type { LlmProvider } from "./types";

export { OpenAiLlmProvider } from "./openai";
export * from "./schemas";
export * from "./types";

let cached: LlmProvider | null = null;

/**
 * Resolves the configured LLM provider. Provider choice is configuration,
 * not business logic — callers only ever see the `LlmProvider` interface.
 */
export function getLlmProvider(): LlmProvider {
	if (cached) return cached;

	switch (env.LLM_PROVIDER) {
		case "openai": {
			if (!env.OPENAI_API_KEY) {
				throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai");
			}
			cached = new OpenAiLlmProvider({
				apiKey: env.OPENAI_API_KEY,
				defaultModel: env.LLM_MODEL,
			});
			return cached;
		}
		case "sarvam": {
			if (!env.SARVAM_API_KEY) {
				throw new Error("SARVAM_API_KEY is required when LLM_PROVIDER=sarvam");
			}
			// Sarvam exposes an OpenAI-compatible surface, so the same adapter works.
			cached = new OpenAiLlmProvider({
				apiKey: env.SARVAM_API_KEY,
				defaultModel: env.LLM_MODEL,
				baseUrl: "https://api.sarvam.ai/v1",
			});
			return cached;
		}
		default:
			throw new Error(`Unsupported LLM_PROVIDER: ${env.LLM_PROVIDER}`);
	}
}

/** Test seam — lets suites inject a deterministic fake. */
export function setLlmProvider(provider: LlmProvider | null): void {
	cached = provider;
}
