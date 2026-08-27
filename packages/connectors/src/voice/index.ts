import { env } from "@doki/env/server";

import { MockVoiceProvider } from "./mock";
import type { AudioPublisher } from "./twilio";
import { TwilioVoiceProvider } from "./twilio";
import type { VoiceProvider } from "./types";
import { VapiVoiceProvider } from "./vapi";

export { MockVoiceProvider } from "./mock";
export { type AudioPublisher, TwilioVoiceProvider } from "./twilio";
export * from "./types";
export { VapiVoiceProvider } from "./vapi";

let cached: VoiceProvider | null = null;

/**
 * Dependencies the app supplies to providers that need them. Kept explicit so
 * the connector layer never reaches into storage or the database itself.
 */
export type VoiceDeps = {
	/** Required by telephony-only providers that must play pre-rendered speech. */
	audio?: AudioPublisher;
};

export function getVoiceProvider(deps: VoiceDeps = {}): VoiceProvider {
	if (cached) return cached;

	switch (env.VOICE_PROVIDER) {
		case "vapi": {
			if (!env.VAPI_API_KEY) {
				throw new Error("VAPI_API_KEY is required when VOICE_PROVIDER=vapi");
			}
			if (env.NODE_ENV === "production" && !env.VAPI_WEBHOOK_SECRET) {
				throw new Error("VAPI_WEBHOOK_SECRET is required in production");
			}
			cached = new VapiVoiceProvider({
				apiKey: env.VAPI_API_KEY,
				webhookSecret: env.VAPI_WEBHOOK_SECRET,
				defaultPhoneNumberId: env.VAPI_PHONE_NUMBER_ID,
			});
			return cached;
		}
		case "twilio": {
			if (
				!env.TWILIO_ACCOUNT_SID ||
				!env.TWILIO_AUTH_TOKEN ||
				!env.TWILIO_FROM_NUMBER
			) {
				throw new Error(
					"TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER are required when VOICE_PROVIDER=twilio",
				);
			}
			cached = new TwilioVoiceProvider({
				accountSid: env.TWILIO_ACCOUNT_SID,
				authToken: env.TWILIO_AUTH_TOKEN,
				fromNumber: env.TWILIO_FROM_NUMBER,
				appUrl: env.APP_URL,
				record: env.TWILIO_RECORD,
				// Webhook handling needs no audio, so a missing publisher only
				// fails when a call is actually placed.
				audio: deps.audio ?? {
					publish: () => {
						throw new Error(
							"No audio publisher configured for the Twilio provider",
						);
					},
				},
			});
			return cached;
		}
		case "mock": {
			if (env.NODE_ENV === "production") {
				throw new Error("VOICE_PROVIDER=mock is not allowed in production");
			}
			cached = new MockVoiceProvider();
			return cached;
		}
		default:
			throw new Error(`Unsupported VOICE_PROVIDER: ${env.VOICE_PROVIDER}`);
	}
}

export function setVoiceProvider(provider: VoiceProvider | null): void {
	cached = provider;
}
