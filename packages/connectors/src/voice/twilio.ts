import twilio, { type Twilio } from "twilio";

import {
	type PlaceCallRequest,
	type PlaceCallResult,
	type VoiceCallStatus,
	type VoiceProvider,
	VoiceProviderError,
	type VoiceWebhookEvent,
	type WebhookRequest,
} from "./types";

type TwilioConfig = {
	accountSid: string;
	authToken: string;
	/** E.164 caller ID. Must be a voice-capable number this account owns. */
	fromNumber: string;
	/** Public base URL used to build status-callback URLs. */
	appUrl: string;
	/** Record calls so the review screen has audio to play. */
	record?: boolean;
	/**
	 * Turns text into a publicly fetchable audio URL. Supplied by the app so
	 * this provider stays free of storage and database concerns.
	 */
	audio: AudioPublisher;
};

/**
 * Publishes synthesised speech at a URL the carrier can fetch.
 * Implemented by the application against the configured TtsProvider.
 */
export type AudioPublisher = {
	publish(input: {
		text: string;
		language: string;
		organizationId: string;
		/** Agent's chosen voice. Falls back to the deployment default. */
		voice?: string;
	}): Promise<{ url: string; id: string }>;
};

/** Twilio's call vocabulary -> ours. Unknown values fail closed to FAILED. */
function mapStatus(status: string | undefined | null): VoiceCallStatus {
	switch (status) {
		case "queued":
			return "QUEUED";
		case "initiated":
			return "DIALING";
		case "ringing":
			return "RINGING";
		case "in-progress":
			return "IN_PROGRESS";
		case "completed":
			return "COMPLETED";
		case "busy":
			return "BUSY";
		case "no-answer":
			return "NO_ANSWER";
		case "canceled":
			return "CANCELED";
		case "failed":
			return "FAILED";
		default:
			return status ? "FAILED" : "QUEUED";
	}
}

/**
 * Telephony-only provider for testing the pipeline against a real carrier.
 *
 * IMPORTANT: this does NOT hold a conversation. Twilio is the phone network,
 * not a voice-AI orchestrator — the agent's opening line is played once and
 * the call ends. Use it to prove dispatch, webhooks, recordings, durations and
 * cost attribution work end to end with a phone that actually rings. For
 * back-and-forth dialogue, use the Vapi provider.
 *
 * All speech comes from Sarvam via the injected publisher and is delivered
 * with TwiML <Play>. Twilio's own text-to-speech voices are never used:
 * they mispronounce Hindi and code-mixed Hinglish badly enough to undermine
 * the product in its target market.
 */
export class TwilioVoiceProvider implements VoiceProvider {
	readonly name = "twilio";
	private readonly client: Twilio;
	/** Cached account-capability probe; null until first resolved. */
	private trial: boolean | null = null;

	constructor(private readonly config: TwilioConfig) {
		this.client = twilio(config.accountSid, config.authToken);
	}

	/**
	 * Trial accounts reject most call parameters outright, including inline
	 * TwiML. Detected once and cached, so a paid account still gets recording,
	 * answering-machine detection and status callbacks.
	 */
	private async isTrialAccount(): Promise<boolean> {
		if (this.trial !== null) return this.trial;
		try {
			const account = await this.client.api
				.accounts(this.config.accountSid)
				.fetch();
			this.trial = account.type === "Trial";
		} catch {
			// Fail safe: assume trial, which sends the minimal parameter set.
			this.trial = true;
		}
		return this.trial;
	}

	async placeCall(req: PlaceCallRequest): Promise<PlaceCallResult> {
		const appUrl = this.config.appUrl.replace(/\/$/, "");
		const statusCallback = `${appUrl}/api/webhooks/twilio`;

		// Synthesise before dialling. If speech fails the call is never placed,
		// which is correct: a silent call is worse than no call.
		const audio = await this.config.audio.publish({
			text: req.firstMessage,
			language: req.language,
			organizationId: req.organizationId,
			// Carries the agent's voice. Without this every agent in the
			// workspace would speak in the one voice set on the deployment.
			voice: req.voiceId,
		});

		const trial = await this.isTrialAccount();

		// `Twiml` (inline) is a paid-only parameter, so the document is served
		// from our own endpoint instead and fetched by Twilio.
		const twimlUrl = `${appUrl}/api/twiml/play?a=${encodeURIComponent(audio.id)}`;

		try {
			const call = await this.client.calls.create({
				from: this.config.fromNumber,
				to: req.toNumber,
				url: twimlUrl,
				// A trial account accepts From, To and Url and nothing else —
				// `method` included. Twilio defaults to POST, which our TwiML
				// route handles, so omitting it costs nothing.
				...(trial
					? {}
					: {
							method: "POST" as const,
							statusCallback,
							statusCallbackMethod: "POST" as const,
							statusCallbackEvent: [
								"initiated",
								"ringing",
								"answered",
								"completed",
							],
							machineDetection: "Enable",
							timeout: 30,
							...(this.config.record !== false
								? {
										record: true,
										recordingStatusCallback: statusCallback,
										recordingStatusCallbackMethod: "POST" as const,
									}
								: {}),
						}),
			});

			if (!call.sid) {
				throw new VoiceProviderError(
					"Twilio did not return a call SID",
					502,
					true,
				);
			}

			return { providerCallId: call.sid, status: mapStatus(call.status) };
		} catch (error) {
			if (error instanceof VoiceProviderError) throw error;

			// The SDK surfaces Twilio's numeric error codes, which say far more
			// than an HTTP status: 21210 is an unowned caller ID, 573002 an
			// unverified destination on a trial account.
			const err = error as { status?: number; code?: number; message?: string };
			const detail = err.code ? ` [Twilio ${err.code}]` : "";
			const status = err.status ?? 502;

			throw new VoiceProviderError(
				`Twilio call failed${detail}: ${err.message ?? String(error)}`,
				status,
				status === 429 || status >= 500,
			);
		}
	}

	/**
	 * Polls a call's current state.
	 *
	 * Needed because trial accounts cannot register a status callback, so no
	 * webhook ever arrives and a call would otherwise sit at QUEUED forever.
	 */
	async fetchCall(providerCallId: string): Promise<VoiceWebhookEvent | null> {
		try {
			const call = await this.client.calls(providerCallId).fetch();
			const status = mapStatus(call.status);
			const occurredAt = new Date();

			const TERMINAL: VoiceCallStatus[] = [
				"COMPLETED",
				"FAILED",
				"BUSY",
				"NO_ANSWER",
				"CANCELED",
			];

			if (!TERMINAL.includes(status)) {
				return { kind: "STATUS", providerCallId, status, occurredAt };
			}

			const answeredBy = (call as { answeredBy?: string }).answeredBy;

			return {
				kind: "ENDED",
				providerCallId,
				status: answeredBy?.startsWith("machine") ? "VOICEMAIL" : status,
				endedReason: answeredBy ?? call.status ?? null,
				durationSeconds: Number(call.duration ?? 0),
				recordingUrl: null,
				transcriptText: null,
				turns: [],
				providerCostUsd: call.price ? Math.abs(Number(call.price)) : null,
				occurredAt,
			};
		} catch {
			return null;
		}
	}

	async endCall(providerCallId: string): Promise<void> {
		try {
			await this.client.calls(providerCallId).update({ status: "completed" });
		} catch (error) {
			const err = error as { status?: number; message?: string };
			// Already gone is not a failure.
			if (err.status === 404) return;
			throw new VoiceProviderError(
				`Failed to end call ${providerCallId}: ${err.message ?? String(error)}`,
				err.status ?? 502,
				true,
			);
		}
	}

	/**
	 * Delegates to Twilio's own validator rather than hand-rolling the HMAC.
	 *
	 * The signature covers the full request URL plus every POST parameter in
	 * sorted order, so `APP_URL` must match exactly what Twilio was told to
	 * call — a proxy that rewrites the URL breaks verification, and that shows
	 * up as 401 rather than as a connection error.
	 */
	verifyWebhook(req: WebhookRequest): boolean {
		const signature =
			req.headers["x-twilio-signature"] ??
			req.headers["X-Twilio-Signature"] ??
			"";
		if (!signature) return false;

		const params = Object.fromEntries(new URLSearchParams(req.rawBody));
		return twilio.validateRequest(
			this.config.authToken,
			signature,
			req.url,
			params,
		);
	}

	parseWebhook(req: WebhookRequest): VoiceWebhookEvent | null {
		const params = new URLSearchParams(req.rawBody);
		const providerCallId = params.get("CallSid");
		if (!providerCallId) return null;

		const occurredAt = new Date();

		// Recording callbacks arrive separately from call-status callbacks.
		const recordingUrl = params.get("RecordingUrl");
		if (params.get("RecordingSid") && recordingUrl) {
			return {
				kind: "ENDED",
				providerCallId,
				status: "COMPLETED",
				endedReason: "recording-ready",
				durationSeconds: Number(params.get("RecordingDuration") ?? 0),
				// Twilio serves the audio at .mp3; the bare URL returns metadata.
				recordingUrl: `${recordingUrl}.mp3`,
				transcriptText: null,
				turns: [],
				providerCostUsd: null,
				occurredAt,
			};
		}

		const status = mapStatus(params.get("CallStatus"));
		const TERMINAL: VoiceCallStatus[] = [
			"COMPLETED",
			"FAILED",
			"BUSY",
			"NO_ANSWER",
			"CANCELED",
		];

		if (!TERMINAL.includes(status)) {
			return { kind: "STATUS", providerCallId, status, occurredAt };
		}

		// Answering-machine detection, when Twilio reports it.
		const answeredBy = params.get("AnsweredBy");
		const finalStatus: VoiceCallStatus = answeredBy?.startsWith("machine")
			? "VOICEMAIL"
			: status;

		return {
			kind: "ENDED",
			providerCallId,
			status: finalStatus,
			endedReason: answeredBy ?? params.get("CallStatus"),
			durationSeconds: Number(params.get("CallDuration") ?? 0),
			recordingUrl: null,
			transcriptText: null,
			// A played announcement is one-way, so there is no dialogue to record.
			turns: [],
			providerCostUsd: null,
			occurredAt,
		};
	}
}
