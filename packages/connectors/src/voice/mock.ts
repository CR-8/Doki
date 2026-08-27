import { randomUUID } from "node:crypto";

import type {
	PlaceCallRequest,
	PlaceCallResult,
	VoiceProvider,
	VoiceWebhookEvent,
	WebhookRequest,
} from "./types";

/**
 * In-memory provider for local development and for seeding demo calls.
 *
 * Deliberately included: live demos fail. Being able to replay a realistic
 * call without touching a carrier is what keeps a sales meeting on the rails.
 */
export class MockVoiceProvider implements VoiceProvider {
	readonly name = "mock";
	readonly placed: PlaceCallRequest[] = [];

	async placeCall(req: PlaceCallRequest): Promise<PlaceCallResult> {
		this.placed.push(req);
		return { providerCallId: `mock_${randomUUID()}`, status: "QUEUED" };
	}

	async endCall(): Promise<void> {
		// no-op
	}

	/** Accepts anything — this provider must never be enabled in production. */
	verifyWebhook(): boolean {
		return true;
	}

	parseWebhook(req: WebhookRequest): VoiceWebhookEvent | null {
		let payload: unknown;
		try {
			payload = JSON.parse(req.rawBody);
		} catch {
			return null;
		}
		if (typeof payload !== "object" || payload === null) return null;
		const p = payload as Record<string, unknown>;
		if (typeof p.providerCallId !== "string" || typeof p.kind !== "string")
			return null;
		return payload as VoiceWebhookEvent;
	}
}
