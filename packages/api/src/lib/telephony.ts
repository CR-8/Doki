import { decryptSecret } from "@doki/connectors/crypto";
import {
	createVoiceProvider,
	getVoiceProvider,
	type VoiceDeps,
	type VoiceProvider,
} from "@doki/connectors/voice/index";
import { organizationTelephony } from "@doki/db/schema";
import { eq } from "drizzle-orm";

/** Where the credentials in use came from. Surfaced so the console can say so. */
export type TelephonySource = "workspace" | "environment";

export type ResolvedVoice = {
	voice: VoiceProvider;
	source: TelephonySource;
	/** Set when a workspace row exists but could not be used. */
	problem: string | null;
};

/**
 * Picks the voice provider for one workspace.
 *
 * Falls back to the environment-configured provider when the workspace has not
 * connected an account of its own, so nothing that worked before this table
 * existed stops working. A workspace row that is present but unusable — half
 * filled in, or encrypted under a rotated secret — falls back too, and reports
 * why rather than failing the dispatch outright.
 */
export async function resolveVoiceForOrg(
	// biome-ignore lint/suspicious/noExplicitAny: drizzle db type is not portable across packages
	db: any,
	organizationId: string,
	deps: VoiceDeps = {},
): Promise<ResolvedVoice> {
	const [row] = await db
		.select()
		.from(organizationTelephony)
		.where(eq(organizationTelephony.organizationId, organizationId))
		.limit(1);

	if (!row) {
		return {
			voice: getVoiceProvider(deps),
			source: "environment",
			problem: null,
		};
	}

	const fallback = (problem: string): ResolvedVoice => ({
		voice: getVoiceProvider(deps),
		source: "environment",
		problem,
	});

	if (row.provider === "mock") {
		return {
			voice: createVoiceProvider({ provider: "mock" }, deps),
			source: "workspace",
			problem: null,
		};
	}

	const secret = decryptSecret(row.authTokenEncrypted);
	if (!secret) {
		return fallback(
			row.authTokenEncrypted
				? "Stored credentials could not be decrypted. Re-enter them."
				: "No credentials saved for this workspace.",
		);
	}

	if (row.provider === "twilio") {
		if (!row.accountSid || !row.fromNumber) {
			return fallback("Twilio needs an account SID and a from-number.");
		}
		return {
			voice: createVoiceProvider(
				{
					provider: "twilio",
					accountSid: row.accountSid,
					authToken: secret,
					fromNumber: row.fromNumber,
					record: row.record,
				},
				deps,
			),
			source: "workspace",
			problem: null,
		};
	}

	return {
		voice: createVoiceProvider(
			{
				provider: "vapi",
				apiKey: secret,
				phoneNumberId: row.phoneNumberId ?? undefined,
			},
			deps,
		),
		source: "workspace",
		problem: null,
	};
}

/**
 * Finds the workspace that owns a Twilio account SID.
 *
 * Webhooks carry no session, so this is how an inbound callback is attributed
 * to a tenant before its signature is checked. Using the claimed SID only to
 * *select* a key is safe: a forged SID simply fails the signature check that
 * follows.
 */
export async function resolveVoiceByAccountSid(
	// biome-ignore lint/suspicious/noExplicitAny: see above
	db: any,
	accountSid: string,
	deps: VoiceDeps = {},
): Promise<VoiceProvider | null> {
	const [row] = await db
		.select()
		.from(organizationTelephony)
		.where(eq(organizationTelephony.accountSid, accountSid))
		.limit(1);

	if (row?.provider !== "twilio") return null;

	const secret = decryptSecret(row.authTokenEncrypted);
	if (!secret || !row.fromNumber) return null;

	return createVoiceProvider(
		{
			provider: "twilio",
			accountSid: row.accountSid as string,
			authToken: secret,
			fromNumber: row.fromNumber,
			record: row.record,
		},
		deps,
	);
}
