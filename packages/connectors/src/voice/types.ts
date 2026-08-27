/** Technical call states, mirroring the `call_status` pg enum. */
export type VoiceCallStatus =
	| "QUEUED"
	| "DIALING"
	| "RINGING"
	| "IN_PROGRESS"
	| "COMPLETED"
	| "FAILED"
	| "BUSY"
	| "NO_ANSWER"
	| "VOICEMAIL"
	| "CANCELED";

export type PlaceCallRequest = {
	/** Our own call row id — echoed back by the provider for correlation. */
	callId: string;
	organizationId: string;
	/** E.164 destination. */
	toNumber: string;
	/** Provider-side id of the registered outbound number. */
	fromNumberId?: string;
	/** Provider-side assistant/agent id, if the agent has been published. */
	externalAgentId?: string;
	/** Spoken first, before anything else. Mandatory AI disclosure. */
	firstMessage: string;
	/** Persona, objective, FAQs, guardrails — already assembled. */
	systemPrompt: string;
	language: string;
	voiceId?: string;
	maxCallSeconds: number;
	/** Correlates provider-side retries with our idempotency key. */
	idempotencyKey: string;
	metadata?: Record<string, unknown>;
};

export type PlaceCallResult = {
	providerCallId: string;
	status: VoiceCallStatus;
};

export type VoiceTranscriptTurn = {
	role: "assistant" | "user";
	content: string;
	offsetMs: number;
};

/**
 * Normalised provider event. Adapters translate vendor payloads into this
 * shape so the webhook handler contains no vendor-specific branching.
 */
export type VoiceWebhookEvent =
	| {
			kind: "STATUS";
			providerCallId: string;
			status: VoiceCallStatus;
			occurredAt: Date;
	  }
	| {
			kind: "TRANSCRIPT";
			providerCallId: string;
			turns: VoiceTranscriptTurn[];
	  }
	| {
			kind: "ENDED";
			providerCallId: string;
			status: VoiceCallStatus;
			endedReason: string | null;
			durationSeconds: number;
			recordingUrl: string | null;
			transcriptText: string | null;
			turns: VoiceTranscriptTurn[];
			/** Provider's own cost figure, if supplied, in USD. */
			providerCostUsd: number | null;
			occurredAt: Date;
	  };

/**
 * Telephony + conversation orchestration. Business logic depends on this only.
 * Swapping Vapi for a self-hosted pipeline later means writing one new class.
 */
/** Everything a provider needs to authenticate an inbound webhook. */
export type WebhookRequest = {
	/** Unparsed body bytes, exactly as received. */
	rawBody: string;
	headers: Record<string, string>;
	/** Full request URL — Twilio signs over it, so it is part of the signature. */
	url: string;
};

export interface VoiceProvider {
	readonly name: string;
	placeCall(req: PlaceCallRequest): Promise<PlaceCallResult>;
	endCall(providerCallId: string): Promise<void>;
	/**
	 * Must run against the RAW body, before any parsing. Verifying a
	 * re-serialised object compares different bytes than the ones signed.
	 */
	verifyWebhook(req: WebhookRequest): boolean;
	/**
	 * Providers decode their own wire format — Vapi sends JSON, Twilio sends
	 * form-encoded — so the route stays free of vendor branching.
	 */
	parseWebhook(req: WebhookRequest): VoiceWebhookEvent | null;
}

export class VoiceProviderError extends Error {
	constructor(
		message: string,
		readonly status?: number,
		readonly retryable = false,
	) {
		super(message);
		this.name = "VoiceProviderError";
	}
}
