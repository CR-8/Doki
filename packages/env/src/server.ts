import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),

		/** Set by the platform. Used to pick serverless-safe connection pooling. */
		VERCEL: z.string().optional(),
		AWS_LAMBDA_FUNCTION_NAME: z.string().optional(),

		// ---- Cache (optional; falls back to per-instance memory) -------------
		UPSTASH_REDIS_REST_URL: z.string().optional(),
		UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

		/** Shared secret for the scheduled follow-up runner endpoint. */
		CRON_SECRET: z.string().optional(),

		/** Public origin used to build provider webhook callback URLs. */
		APP_URL: z.url().default("http://localhost:3001"),

		// ---- LLM ------------------------------------------------------------
		LLM_PROVIDER: z.enum(["openai", "sarvam"]).default("openai"),
		LLM_MODEL: z.string().default("gpt-4o-mini"),
		OPENAI_API_KEY: z.string().optional(),

		// ---- Voice orchestration --------------------------------------------
		VOICE_PROVIDER: z.enum(["vapi", "twilio", "mock"]).default("mock"),
		VAPI_API_KEY: z.string().optional(),
		/** Verifies inbound Vapi webhooks. Required in production. */
		VAPI_WEBHOOK_SECRET: z.string().optional(),
		/** Provider-side id of the registered outbound number. */
		VAPI_PHONE_NUMBER_ID: z.string().optional(),

		// ---- Twilio (telephony-only, for pipeline testing) -------------------
		TWILIO_ACCOUNT_SID: z.string().optional(),
		TWILIO_AUTH_TOKEN: z.string().optional(),
		TWILIO_FROM_NUMBER: z.string().optional(),
		TWILIO_RECORD: z.coerce.boolean().default(true),

		// ---- Speech (Indic) --------------------------------------------------
		SARVAM_API_KEY: z.string().optional(),
		SARVAM_STT_MODEL: z.string().default("saarika:v2"),
		SARVAM_TTS_MODEL: z.string().default("bulbul:v2"),
		/** Bulbul voice id. v2: anushka, manisha, vidya, arya, abhilash, karun, hitesh. */
		SARVAM_TTS_SPEAKER: z.string().default("anushka"),

		// ---- Cost model (INR) ------------------------------------------------
		// Drives usage metering. Keep these in config, never hardcoded in logic,
		// so re-pricing is an env change rather than a deploy of new business code.
		COST_TELEPHONY_INR_PER_MIN: z.coerce.number().default(0.75),
		COST_STT_INR_PER_MIN: z.coerce.number().default(1.5),
		COST_TTS_INR_PER_10K_CHARS: z.coerce.number().default(30),
		COST_LLM_INR_PER_1K_INPUT: z.coerce.number().default(0.02),
		COST_LLM_INR_PER_1K_OUTPUT: z.coerce.number().default(0.08),
		COST_PLATFORM_INR_PER_MIN: z.coerce.number().default(4.2),
	},
	runtimeEnv: process.env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
