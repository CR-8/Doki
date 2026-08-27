import { createHmac, timingSafeEqual } from "node:crypto";

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
	/** E.164 caller ID, or a Twilio Messaging/Voice number you own. */
	fromNumber: string;
	/** Public base URL used to build status-callback URLs. */
	appUrl: string;
	/** Record calls so the review screen has audio to play. */
	record?: boolean;
	baseUrl?: string;
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
	}): Promise<{ url: string }>;
};

/** Twilio's call vocabulary -> ours. Unknown values fail closed to FAILED. */
function mapStatus(status: string | undefined): VoiceCallStatus {
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

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
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
 * Speech comes from Sarvam via the injected publisher, never from Twilio's own
 * <Say>: carrier-provided voices mispronounce Hindi and Hinglish badly enough
 * to undermine the whole product.
 */
export class TwilioVoiceProvider implements VoiceProvider {
	readonly name = "twilio";
	private readonly baseUrl: string;

	constructor(private readonly config: TwilioConfig) {
		this.baseUrl = config.baseUrl ?? "https://api.twilio.com";
	}

	private get authHeader(): string {
		const encoded = Buffer.from(
			`${this.config.accountSid}:${this.config.authToken}`,
		).toString("base64");
		return `Basic ${encoded}`;
	}

	/** Announcement TwiML playing Sarvam-synthesised audio. */
	private buildTwiml(audioUrl: string): string {
		return [
			'<?xml version="1.0" encoding="UTF-8"?>',
			"<Response>",
			`<Play>${escapeXml(audioUrl)}</Play>`,
			'<Pause length="1"/>',
			"<Hangup/>",
			"</Response>",
		].join("");
	}

	async placeCall(req: PlaceCallRequest): Promise<PlaceCallResult> {
		const statusCallback = `${this.config.appUrl.replace(/\/$/, "")}/api/webhooks/twilio`;

		// Synthesise before dialling. If speech fails the call is never placed,
		// which is correct: a silent call is worse than no call.
		const { url: audioUrl } = await this.config.audio.publish({
			text: req.firstMessage,
			language: req.language,
			organizationId: req.organizationId,
		});

		const body = new URLSearchParams({
			To: req.toNumber,
			From: this.config.fromNumber,
			Twiml: this.buildTwiml(audioUrl),
			StatusCallback: statusCallback,
			StatusCallbackMethod: "POST",
			// Terminal states only would lose ringing/answered transitions.
			MachineDetection: "Enable",
			Timeout: "30",
		});
		for (const event of ["initiated", "ringing", "answered", "completed"]) {
			body.append("StatusCallbackEvent", event);
		}
		if (this.config.record !== false) {
			body.append("Record", "true");
			body.append("RecordingStatusCallback", statusCallback);
			body.append("RecordingStatusCallbackMethod", "POST");
		}

		const res = await fetch(
			`${this.baseUrl}/2010-04-01/Accounts/${this.config.accountSid}/Calls.json`,
			{
				method: "POST",
				headers: {
					authorization: this.authHeader,
					"content-type": "application/x-www-form-urlencoded",
				},
				body,
			},
		);

		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new VoiceProviderError(
				`Twilio call failed (${res.status}): ${text.slice(0, 500)}`,
				res.status,
				res.status === 429 || res.status >= 500,
			);
		}

		const payload = (await res.json()) as { sid?: string; status?: string };
		if (!payload.sid) {
			throw new VoiceProviderError(
				"Twilio did not return a call SID",
				res.status,
				true,
			);
		}

		return { providerCallId: payload.sid, status: mapStatus(payload.status) };
	}

	async endCall(providerCallId: string): Promise<void> {
		const res = await fetch(
			`${this.baseUrl}/2010-04-01/Accounts/${this.config.accountSid}/Calls/${providerCallId}.json`,
			{
				method: "POST",
				headers: {
					authorization: this.authHeader,
					"content-type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({ Status: "completed" }),
			},
		);
		if (!res.ok && res.status !== 404) {
			throw new VoiceProviderError(
				`Failed to end call ${providerCallId}`,
				res.status,
				true,
			);
		}
	}

	/**
	 * Twilio's signature is HMAC-SHA1 over the full request URL with every
	 * POST parameter appended in sorted key order — so both the URL and the
	 * exact form body matter. A proxy that rewrites the URL will break this;
	 * `APP_URL` must match what Twilio was configured to call.
	 */
	verifyWebhook(req: WebhookRequest): boolean {
		const received =
			req.headers["x-twilio-signature"] ??
			req.headers["X-Twilio-Signature"] ??
			"";
		if (!received) return false;

		const params = new URLSearchParams(req.rawBody);
		const sorted = [...params.keys()].sort();

		let payload = req.url;
		for (const key of sorted) {
			payload += key + params.get(key);
		}

		const expected = createHmac("sha1", this.config.authToken)
			.update(Buffer.from(payload, "utf8"))
			.digest("base64");

		const a = Buffer.from(received);
		const b = Buffer.from(expected);
		if (a.length !== b.length) return false;
		return timingSafeEqual(a, b);
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

		const status = mapStatus(params.get("CallStatus") ?? undefined);
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
