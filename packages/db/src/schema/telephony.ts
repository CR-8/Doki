import { relations, sql } from "drizzle-orm";
import {
	boolean,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { organization } from "./tenant";

export const voiceProviderEnum = pgEnum("voice_provider", [
	"twilio",
	"vapi",
	"mock",
]);

/**
 * Per-workspace telephony credentials.
 *
 * The commercial model is that the customer owns the number and the DLT
 * registration, not us — which only works if each workspace dials from its own
 * account. Environment variables cannot express that: they are process-wide, so
 * every tenant would share one caller ID and one bill.
 *
 * Secrets are stored encrypted (AES-256-GCM) and never returned to the client.
 * The identifiers beside them are kept in clear because they are not secret and
 * the console needs to show which account is connected.
 */
export const organizationTelephony = pgTable(
	"organization_telephony",
	{
		organizationId: text("organization_id")
			.primaryKey()
			.references(() => organization.id, { onDelete: "cascade" }),

		provider: voiceProviderEnum("provider").default("twilio").notNull(),

		/** Twilio account SID, or the Vapi org identifier. Not a secret. */
		accountSid: text("account_sid"),
		/**
		 * Encrypted auth token / API key, as `v1.<iv>.<tag>.<ciphertext>`.
		 * Never selected into any response the browser can see.
		 */
		authTokenEncrypted: text("auth_token_encrypted"),
		/** Last four characters, so the console can show something recognisable. */
		authTokenLast4: text("auth_token_last4"),

		/** E.164 number calls are placed from. */
		fromNumber: text("from_number"),
		/** Vapi only: which registered number to dial out on. */
		phoneNumberId: text("phone_number_id"),

		/** Recording is a per-customer legal decision, not a global default. */
		record: boolean("record").default(true).notNull(),

		/** Result of the last connection test, so the console can show status. */
		verifiedAt: timestamp("verified_at"),
		lastError: text("last_error"),
		/** Trial accounts reject most call parameters; worth remembering. */
		isTrial: boolean("is_trial"),

		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		// Webhooks arrive carrying an account SID but no session, so this is the
		// index that resolves an inbound callback to the workspace that owns it.
		uniqueIndex("telephony_account_sid_uidx")
			.on(table.accountSid)
			.where(sql`${table.accountSid} is not null`),
		index("telephony_provider_idx").on(table.provider),
	],
);

export const organizationTelephonyRelations = relations(
	organizationTelephony,
	({ one }) => ({
		organization: one(organization, {
			fields: [organizationTelephony.organizationId],
			references: [organization.id],
		}),
	}),
);

export type OrganizationTelephony = typeof organizationTelephony.$inferSelect;
export type NewOrganizationTelephony =
	typeof organizationTelephony.$inferInsert;
