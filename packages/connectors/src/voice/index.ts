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
 * Explicit provider configuration, as opposed to whatever the environment
 * happens to hold. This is what per-workspace credentials are expressed in.
 */
export type VoiceProviderConfig =
	| {
			provider: "twilio";
			accountSid: string;
			authToken: string;
			fromNumber: string;
			record?: boolean;
	  }
	| {
			provider: "vapi";
			apiKey: string;
			webhookSecret?: string;
			phoneNumberId?: string;
	  }
	| { provider: "mock" };

/**
 * Dependencies the app supplies to providers that need them. Kept explicit so
 * the connector layer never reaches into storage or the database itself.
 */
export type VoiceDeps = {
	/** Required by telephony-only providers that must play pre-rendered speech. */
	audio?: AudioPublisher;
};

/**
 * Builds a provider from an explicit configuration.
 *
 * Deliberately uncached: these are per-workspace credentials, and a module-level
 * cache keyed on nothing would hand the first tenant's Twilio account to every
 * tenant that called afterwards. Construction is cheap — it opens no
 * connections — so callers can build one per request without concern.
 */
export function createVoiceProvider(
	config: VoiceProviderConfig,
	deps: VoiceDeps = {},
): VoiceProvider {
	switch (config.provider) {
		case "twilio":
			return new TwilioVoiceProvider({
				accountSid: config.accountSid,
				authToken: config.authToken,
				fromNumber: config.fromNumber,
				appUrl: env.APP_URL,
				record: config.record ?? true,
				audio: deps.audio ?? {
					publish: () => {
						throw new Error(
							"No audio publisher configured for the Twilio provider",
						);
					},
				},
			});
		case "vapi":
			return new VapiVoiceProvider({
				apiKey: config.apiKey,
				webhookSecret: config.webhookSecret,
				defaultPhoneNumberId: config.phoneNumberId,
			});
		case "mock":
			return new MockVoiceProvider();
	}
}

/**
 * The environment-configured provider.
 *
 * Still the fallback for any workspace that has not connected its own account,
 * and the only thing available to code with no tenant in hand.
 */
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
