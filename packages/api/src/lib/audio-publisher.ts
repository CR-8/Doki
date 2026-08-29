import { createHash } from "node:crypto";

import { getTtsProvider } from "@doki/connectors/tts/index";
import type { AudioPublisher } from "@doki/connectors/voice/index";
import { db } from "@doki/db";
import { ttsAsset, usageEvent } from "@doki/db/schema";
import { env } from "@doki/env/server";
import { and, eq, gt } from "drizzle-orm";

/** How long a rendered clip stays fetchable before it is re-synthesised. */
const TTL_DAYS = 30;

function hashContent(parts: string[]): string {
	return createHash("sha256").update(parts.join(" ")).digest("hex");
}

function audioUrl(id: string): string {
	// The .mp3 suffix is cosmetic but keeps carriers and browsers happy.
	return `${env.APP_URL.replace(/\/$/, "")}/api/audio/${id}.mp3`;
}

/**
 * Renders speech with Sarvam and exposes it at a URL the carrier can fetch.
 *
 * Cached by a hash of (text, language, speaker, model): the AI disclosure is
 * identical on every call, and TTS is the most expensive per-minute component
 * in the stack — paying for it once instead of once per dial is the single
 * biggest cost lever available here.
 */
export const audioPublisher: AudioPublisher = {
	async publish({ text, language, organizationId }) {
		const tts = getTtsProvider();
		const trimmed = text.trim();

		const speaker = env.SARVAM_TTS_SPEAKER;
		const model = env.SARVAM_TTS_MODEL;
		const contentHash = hashContent([trimmed, language, speaker, model]);

		const [cached] = await db
			.select({ id: ttsAsset.id })
			.from(ttsAsset)
			.where(
				and(
					eq(ttsAsset.organizationId, organizationId),
					eq(ttsAsset.contentHash, contentHash),
					gt(ttsAsset.expiresAt, new Date()),
				),
			)
			.limit(1);

		if (cached) return { url: audioUrl(cached.id), id: cached.id };

		const result = await tts.synthesize({ text: trimmed, language, speaker });
		const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 3600 * 1000);

		const [created] = await db
			.insert(ttsAsset)
			.values({
				organizationId,
				contentHash,
				text: trimmed,
				language,
				speaker: result.speaker,
				model: result.model,
				provider: tts.name,
				mimeType: result.mimeType,
				audioBase64: result.audio.toString("base64"),
				byteLength: result.audio.byteLength,
				characters: result.characters,
				expiresAt,
			})
			// A concurrent dial may have rendered the same copy first.
			.onConflictDoUpdate({
				target: [ttsAsset.organizationId, ttsAsset.contentHash],
				set: { expiresAt },
			})
			.returning({ id: ttsAsset.id });

		if (!created) throw new Error("Could not store synthesised audio");

		// Meter at the point of spend — synthesis, not playback.
		const cost = (result.characters / 10_000) * env.COST_TTS_INR_PER_10K_CHARS;
		await db
			.insert(usageEvent)
			.values({
				organizationId,
				kind: "TTS_CHARACTERS",
				provider: tts.name,
				model: result.model,
				units: String(result.characters),
				totalCostInr: String(Math.round(cost * 10_000) / 10_000),
				idempotencyKey: `usage:tts:${contentHash}`,
				metadata: { speaker: result.speaker, language },
			})
			.onConflictDoNothing();

		return { url: audioUrl(created.id), id: created.id };
	},
};
