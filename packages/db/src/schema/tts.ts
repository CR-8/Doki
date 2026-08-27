import { relations } from "drizzle-orm";
import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

import { organization } from "./tenant";

/**
 * Synthesised speech, stored so a carrier can fetch it over HTTP.
 *
 * Twilio's <Play> needs a public URL, and re-synthesising identical copy on
 * every call would be pure waste — TTS is the single most expensive component
 * per minute. Keyed by a hash of (text, voice, model) so the same disclosure
 * is paid for once and replayed thereafter.
 *
 * Audio is held as base64 text rather than bytea: clips are a few seconds
 * long, and it keeps the postgres-js round trip simple. Move to S3 when call
 * volume makes that worthwhile.
 */
export const ttsAsset = pgTable(
	"tts_asset",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),

		/** sha256 of text + speaker + model + sample rate. */
		contentHash: text("content_hash").notNull(),

		/** Kept for debugging and for showing operators what was spoken. */
		text: text("text").notNull(),
		language: text("language").notNull(),
		speaker: text("speaker").notNull(),
		model: text("model").notNull(),
		provider: text("provider").default("sarvam").notNull(),

		mimeType: text("mime_type").default("audio/mpeg").notNull(),
		audioBase64: text("audio_base64").notNull(),
		byteLength: integer("byte_length").default(0).notNull(),
		/** Billable characters, mirrored into usage_event. */
		characters: integer("characters").default(0).notNull(),

		/**
		 * Assets are served from an unauthenticated URL so the carrier can
		 * fetch them, so they expire rather than living forever.
		 */
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("tts_asset_org_hash_uidx").on(
			table.organizationId,
			table.contentHash,
		),
		index("tts_asset_expires_idx").on(table.expiresAt),
	],
);

export const ttsAssetRelations = relations(ttsAsset, ({ one }) => ({
	organization: one(organization, {
		fields: [ttsAsset.organizationId],
		references: [organization.id],
	}),
}));

export type TtsAsset = typeof ttsAsset.$inferSelect;
