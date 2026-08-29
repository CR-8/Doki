import { env } from "@doki/env/server";

import { SarvamTtsProvider } from "./sarvam";
import type { TtsProvider } from "./types";

export { chunkText, SarvamTtsProvider, toSarvamLanguage } from "./sarvam";
export * from "./types";
export * from "./voices";

let cached: TtsProvider | null = null;

/**
 * Resolves the configured speech provider. Sarvam is the only production
 * option today; the interface exists so a self-hosted model can replace it
 * without touching business logic.
 */
export function getTtsProvider(): TtsProvider {
	if (cached) return cached;

	if (!env.SARVAM_API_KEY) {
		throw new Error("SARVAM_API_KEY is required for speech synthesis");
	}

	cached = new SarvamTtsProvider({
		apiKey: env.SARVAM_API_KEY,
		model: env.SARVAM_TTS_MODEL,
		speaker: env.SARVAM_TTS_SPEAKER,
	});
	return cached;
}

/** Test seam — lets suites inject a deterministic fake. */
export function setTtsProvider(provider: TtsProvider | null): void {
	cached = provider;
}
