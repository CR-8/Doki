import { timingSafeEqual } from "node:crypto";

import {
	type PlaceCallRequest,
	type PlaceCallResult,
	type VoiceCallStatus,
	type VoiceProvider,
	VoiceProviderError,
	type VoiceTranscriptTurn,
	type VoiceWebhookEvent,
	type WebhookRequest,
} from "./types";

type VapiConfig = {
	apiKey: string;
	webhookSecret?: string;
	defaultPhoneNumberId?: string;
	baseUrl?: string;
};

/** Vapi's vocabulary -> ours. Unknown values fail closed to FAILED. */
function mapStatus(
	status: string | undefined,
	endedReason?: string | null,
): VoiceCallStatus {
	switch (status) {
		case "queued":
		case "scheduled":
			return "QUEUED";
		case "ringing":
			return "RINGING";
		case "in-progress":
			return "IN_PROGRESS";
		case "forwarding":
			return "IN_PROGRESS";
		case "ended":
			break;
		default:
			return status ? "FAILED" : "QUEUED";
	}

	const reason = (endedReason ?? "").toLowerCase();
	if (reason.includes("voicemail")) return "VOICEMAIL";
	if (reason.includes("no-answer") || reason.includes("noanswer"))
		return "NO_ANSWER";
	if (reason.includes("busy")) return "BUSY";
	if (reason.includes("customer-did-not-answer")) return "NO_ANSWER";
	if (reason.includes("canceled") || reason.includes("cancelled"))
		return "CANCELED";
	if (reason.includes("error") || reason.includes("failed")) return "FAILED";
	return "COMPLETED";
}

function toTurns(messages: unknown): VoiceTranscriptTurn[] {
	if (!Array.isArray(messages)) return [];
	const turns: VoiceTranscriptTurn[] = [];
	for (const m of messages) {
		if (typeof m !== "object" || m === null) continue;
		const rec = m as Record<string, unknown>;
		const role = rec.role;
		if (role !== "bot" && role !== "user" && role !== "assistant") continue;
		const content = typeof rec.message === "string" ? rec.message : "";
		if (!content) continue;
		turns.push({
			role: role === "user" ? "user" : "assistant",
			content,
			offsetMs:
				typeof rec.secondsFromStart === "number"
					? Math.round(rec.secondsFromStart * 1000)
					: 0,
		});
	}
	return turns;
}

export class VapiVoiceProvider implements VoiceProvider {
	readonly name = "vapi";
	private readonly baseUrl: string;

	constructor(private readonly config: VapiConfig) {
		this.baseUrl = config.baseUrl ?? "https://api.vapi.ai";
	}

	async placeCall(req: PlaceCallRequest): Promise<PlaceCallResult> {
		const phoneNumberId = req.fromNumberId ?? this.config.defaultPhoneNumberId;
		if (!phoneNumberId) {
			throw new VoiceProviderError(
				"No outbound phone number configured",
				400,
				false,
			);
		}

		// A transient assistant keeps agent config in OUR database as the source of
		// truth, rather than drifting inside the provider's dashboard.
		const assistant = {
			firstMessage: req.firstMessage,
			firstMessageMode: "assistant-speaks-first",
			maxDurationSeconds: req.maxCallSeconds,
			model: {
				provider: "openai",
				model: "gpt-4o-mini",
				messages: [{ role: "system", content: req.systemPrompt }],
			},
			transcriber: {
				provider: "deepgram",
				model: "nova-2",
				language: req.language,
			},
			...(req.voiceId
				? { voice: { provider: "vapi", voiceId: req.voiceId } }
				: {}),
		};

		const res = await fetch(`${this.baseUrl}/call`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${this.config.apiKey}`,
				// Provider-side dedupe, so a retried dispatch cannot double-dial.
				"idempotency-key": req.idempotencyKey,
			},
			body: JSON.stringify({
				phoneNumberId,
				customer: { number: req.toNumber },
				...(req.externalAgentId
					? { assistantId: req.externalAgentId }
					: { assistant }),
				metadata: {
					callId: req.callId,
					organizationId: req.organizationId,
					...req.metadata,
				},
			}),
		});

		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new VoiceProviderError(
				`Vapi call failed (${res.status}): ${text.slice(0, 500)}`,
				res.status,
				res.status === 429 || res.status >= 500,
			);
		}

		const payload = (await res.json()) as { id?: string; status?: string };
		if (!payload.id) {
			throw new VoiceProviderError(
				"Vapi did not return a call id",
				res.status,
				true,
			);
		}

		return { providerCallId: payload.id, status: mapStatus(payload.status) };
	}

	async endCall(providerCallId: string): Promise<void> {
		const res = await fetch(`${this.baseUrl}/call/${providerCallId}`, {
			method: "PATCH",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${this.config.apiKey}`,
			},
			body: JSON.stringify({ status: "ended" }),
		});
		if (!res.ok && res.status !== 404) {
			throw new VoiceProviderError(
				`Failed to end call ${providerCallId}`,
				res.status,
				true,
			);
		}
	}

	verifyWebhook(req: WebhookRequest): boolean {
		const { headers } = req;
		const expected = this.config.webhookSecret;
		// Fail closed: an unconfigured secret must never mean "accept everything".
		if (!expected) return false;

		const received = headers["x-vapi-secret"] ?? headers["X-Vapi-Secret"] ?? "";
		const a = Buffer.from(received);
		const b = Buffer.from(expected);
		if (a.length !== b.length) return false;
		return timingSafeEqual(a, b);
	}

	parseWebhook(req: WebhookRequest): VoiceWebhookEvent | null {
		let payload: unknown;
		try {
			payload = JSON.parse(req.rawBody);
		} catch {
			return null;
		}
		if (typeof payload !== "object" || payload === null) return null;
		const root = payload as Record<string, unknown>;
		const message = (root.message ?? root) as Record<string, unknown>;

		const call = (message.call ?? {}) as Record<string, unknown>;
		const providerCallId = typeof call.id === "string" ? call.id : undefined;
		if (!providerCallId) return null;

		const type = message.type;
		const occurredAt = new Date();

		if (type === "status-update") {
			return {
				kind: "STATUS",
				providerCallId,
				status: mapStatus(message.status as string | undefined),
				occurredAt,
			};
		}

		if (type === "transcript") {
			const role = message.role === "user" ? "user" : "assistant";
			const content =
				typeof message.transcript === "string" ? message.transcript : "";
			if (!content) return null;
			return {
				kind: "TRANSCRIPT",
				providerCallId,
				turns: [{ role, content, offsetMs: 0 }],
			};
		}

		if (type === "end-of-call-report") {
			const artifact = (message.artifact ?? {}) as Record<string, unknown>;
			const endedReason =
				typeof message.endedReason === "string" ? message.endedReason : null;
			const durationSeconds =
				typeof message.durationSeconds === "number"
					? Math.round(message.durationSeconds)
					: 0;

			return {
				kind: "ENDED",
				providerCallId,
				status: mapStatus("ended", endedReason),
				endedReason,
				durationSeconds,
				recordingUrl:
					typeof artifact.recordingUrl === "string"
						? artifact.recordingUrl
						: typeof message.recordingUrl === "string"
							? message.recordingUrl
							: null,
				transcriptText:
					typeof artifact.transcript === "string"
						? artifact.transcript
						: typeof message.transcript === "string"
							? message.transcript
							: null,
				turns: toTurns(artifact.messages ?? message.messages),
				providerCostUsd: typeof message.cost === "number" ? message.cost : null,
				occurredAt,
			};
		}

		return null;
	}
}
