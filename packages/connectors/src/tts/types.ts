export type TtsRequest = {
	text: string;
	/** Our internal tag: "hi-IN", "en-IN", or "hi-en" for code-mixed Hinglish. */
	language: string;
	/** Provider voice id. Falls back to the provider's configured default. */
	speaker?: string;
	/** Telephony is 8 kHz on the wire; higher rates are resampled by the carrier. */
	sampleRate?: number;
};

export type TtsResult = {
	audio: Buffer;
	mimeType: string;
	/** Billable character count — what the provider actually charges for. */
	characters: number;
	model: string;
	speaker: string;
};

/**
 * Speech synthesis. Business logic depends on this, never on a vendor SDK, so
 * moving to a self-hosted model later is a new class rather than a rewrite.
 */
export interface TtsProvider {
	readonly name: string;
	synthesize(req: TtsRequest): Promise<TtsResult>;
}

export class TtsProviderError extends Error {
	constructor(
		message: string,
		readonly status?: number,
		readonly retryable = false,
	) {
		super(message);
		this.name = "TtsProviderError";
	}
}
