import {
	type TtsProvider,
	TtsProviderError,
	type TtsRequest,
	type TtsResult,
} from "./types";

type SarvamConfig = {
	apiKey: string;
	/** "bulbul:v3" (default) or "bulbul:v2". */
	model?: string;
	speaker?: string;
	baseUrl?: string;
};

/**
 * Per-request text ceiling, by model.
 *
 * These are the limits of the streaming endpoint, which allows more per request
 * than the JSON one (3500 vs 2500) — so most copy now goes in a single call.
 */
const MAX_CHARS: Record<string, number> = {
	"bulbul:v3": 3500,
	"bulbul:v2": 1500,
};

/**
 * Sarvam accepts only these BCP-47 codes. Hinglish has no code of its own —
 * hi-IN is the correct target, because Bulbul reads Latin-script English words
 * inside Hindi text natively, which is exactly how Indian sales calls sound.
 */
const SUPPORTED = new Set([
	"bn-IN",
	"en-IN",
	"gu-IN",
	"hi-IN",
	"kn-IN",
	"ml-IN",
	"mr-IN",
	"od-IN",
	"pa-IN",
	"ta-IN",
	"te-IN",
]);

export function toSarvamLanguage(language: string): string {
	if (SUPPORTED.has(language)) return language;
	// "hi-en" (code-mixed) and any bare "hi" variant map onto Hindi.
	if (language.startsWith("hi")) return "hi-IN";
	if (language.startsWith("en")) return "en-IN";
	const prefix = `${language.split("-")[0]}-IN`;
	return SUPPORTED.has(prefix) ? prefix : "hi-IN";
}

/**
 * Splits on sentence boundaries so a chunk break never lands mid-word.
 * Falls back to a hard slice if a single sentence exceeds the limit.
 */
export function chunkText(text: string, limit: number): string[] {
	const trimmed = text.trim();
	if (trimmed.length <= limit) return [trimmed];

	const sentences = trimmed.split(/(?<=[.!?।])\s+/);
	const chunks: string[] = [];
	let current = "";

	for (const sentence of sentences) {
		if (sentence.length > limit) {
			if (current) {
				chunks.push(current);
				current = "";
			}
			for (let i = 0; i < sentence.length; i += limit) {
				chunks.push(sentence.slice(i, i + limit));
			}
			continue;
		}
		if (current.length + sentence.length + 1 > limit) {
			chunks.push(current);
			current = sentence;
		} else {
			current = current ? `${current} ${sentence}` : sentence;
		}
	}

	if (current) chunks.push(current);
	return chunks;
}

/**
 * Sarvam Bulbul text-to-speech.
 *
 * Chosen over generic providers because Indian sales calls are routinely
 * code-mixed Hindi/English, and a model trained on Indic speech pronounces
 * names, numbers and Hinglish correctly where an English-first voice does not.
 */
export class SarvamTtsProvider implements TtsProvider {
	readonly name = "sarvam";
	private readonly baseUrl: string;
	private readonly model: string;
	private readonly speaker: string;

	constructor(private readonly config: SarvamConfig) {
		this.baseUrl = config.baseUrl ?? "https://api.sarvam.ai";
		this.model = config.model ?? "bulbul:v3";
		this.speaker = config.speaker ?? "priya";
	}

	async synthesize(req: TtsRequest): Promise<TtsResult> {
		const text = req.text.trim();
		if (!text)
			throw new TtsProviderError("Cannot synthesise empty text", 400, false);

		const speaker = req.speaker ?? this.speaker;
		const languageCode = toSarvamLanguage(req.language);
		const limit = MAX_CHARS[this.model] ?? 1500;
		const chunks = chunkText(text, limit);

		const buffers: Buffer[] = [];
		for (const chunk of chunks) {
			buffers.push(
				await this.synthesizeChunk(
					chunk,
					languageCode,
					speaker,
					req.sampleRate,
				),
			);
		}

		return {
			// MP3 frames concatenate cleanly, so multi-chunk copy plays as one clip.
			audio: Buffer.concat(buffers),
			mimeType: "audio/mpeg",
			characters: text.length,
			model: this.model,
			speaker,
		};
	}

	private async synthesizeChunk(
		text: string,
		languageCode: string,
		speaker: string,
		sampleRate?: number,
	): Promise<Buffer> {
		// The streaming endpoint rather than the JSON one.
		//
		// It returns raw audio instead of base64 inside JSON, which removes the
		// ~33% encoding overhead and a decode step, accepts 3500 characters
		// instead of 2500, and starts sending bytes before synthesis finishes.
		// The call still resolves to a complete buffer here — Twilio fetches a
		// finished URL with <Play>, so there is nothing downstream to stream to.
		const res = await fetch(`${this.baseUrl}/text-to-speech/stream`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"api-subscription-key": this.config.apiKey,
			},
			body: JSON.stringify({
				text,
				language_code: languageCode,
				model: this.model,
				speaker,
				speech_sample_rate: sampleRate ?? 22050,
				// MP3 is the format Twilio <Play> handles most reliably.
				output_audio_codec: "mp3",
				// Normalises English words and digits before synthesis, which is
				// what stops code-mixed copy being read letter by letter.
				enable_preprocessing: true,
			}),
		});

		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new TtsProviderError(
				`Sarvam TTS failed (${res.status}): ${body.slice(0, 400)}`,
				res.status,
				res.status === 429 || res.status >= 500,
			);
		}

		// Raw audio, not JSON. Reading it as a buffer is the whole point of this
		// endpoint — there is no base64 envelope to decode.
		const audio = Buffer.from(await res.arrayBuffer());

		if (audio.byteLength === 0) {
			throw new TtsProviderError("Sarvam returned no audio", res.status, true);
		}

		return audio;
	}
}
