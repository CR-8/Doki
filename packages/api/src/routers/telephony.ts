import {
	decryptSecret,
	encryptSecret,
	secretHint,
} from "@doki/connectors/crypto";
import { organizationTelephony } from "@doki/db/schema";
import { normalizePhone, recordAudit } from "@doki/domain";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { tenantProcedure } from "../index";
import { audioPublisher } from "../lib/audio-publisher";
import { resolveVoiceForOrg } from "../lib/telephony";

const providerSchema = z.enum(["twilio", "vapi", "mock"]);

type TwilioProbe = {
	ok: boolean;
	message: string;
	isTrial: boolean | null;
	numbers: string[];
};

/**
 * Asks Twilio directly whether these credentials work.
 *
 * Uses the REST API rather than the SDK so this stays a plain fetch with no
 * client construction: the point is to report exactly what Twilio said, not to
 * place a call. Owning zero numbers is reported as a failure because a call
 * cannot be placed without one, however valid the credentials are.
 */
async function probeTwilio(
	accountSid: string,
	authToken: string,
	fromNumber: string | null,
): Promise<TwilioProbe> {
	const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
	const headers = { authorization: `Basic ${auth}` };

	const accountRes = await fetch(
		`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`,
		{ headers },
	);

	if (accountRes.status === 401) {
		return {
			ok: false,
			message: "Twilio rejected these credentials.",
			isTrial: null,
			numbers: [],
		};
	}
	if (!accountRes.ok) {
		return {
			ok: false,
			message: `Twilio returned ${accountRes.status} for the account lookup.`,
			isTrial: null,
			numbers: [],
		};
	}

	const account = (await accountRes.json()) as { type?: string };
	const isTrial = account.type === "Trial";

	const numbersRes = await fetch(
		`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/IncomingPhoneNumbers.json?PageSize=20`,
		{ headers },
	);

	const numbers: string[] = numbersRes.ok
		? ((
				(await numbersRes.json()) as {
					incoming_phone_numbers?: { phone_number: string }[];
				}
			).incoming_phone_numbers?.map((n) => n.phone_number) ?? [])
		: [];

	if (numbers.length === 0) {
		return {
			ok: false,
			message:
				"These credentials work, but the account owns no phone numbers. Buy one before calling.",
			isTrial,
			numbers,
		};
	}

	if (fromNumber && !numbers.includes(fromNumber)) {
		return {
			ok: false,
			message: `${fromNumber} is not owned by this account. Owned: ${numbers.join(", ")}`,
			isTrial,
			numbers,
		};
	}

	return {
		ok: true,
		message: isTrial
			? "Connected. This is a trial account, so calls run with a reduced parameter set and can only reach verified numbers."
			: "Connected.",
		isTrial,
		numbers,
	};
}

/**
 * Per-workspace telephony configuration.
 *
 * Kept separate from the calling policy because these are secrets with a
 * different blast radius: the policy is rules anyone in the workspace should
 * read, the credentials are a bill anyone holding them can run up.
 */
export const telephonyRouter = {
	/**
	 * Current configuration.
	 *
	 * Never returns the token. There is no legitimate reason for the browser to
	 * hold it, and "so the form can prefill" is not one — the form shows a hint
	 * and writes a replacement.
	 */
	get: tenantProcedure.handler(async ({ context }) => {
		const { db, organizationId } = context;

		const [row] = await db
			.select({
				provider: organizationTelephony.provider,
				accountSid: organizationTelephony.accountSid,
				authTokenLast4: organizationTelephony.authTokenLast4,
				fromNumber: organizationTelephony.fromNumber,
				phoneNumberId: organizationTelephony.phoneNumberId,
				record: organizationTelephony.record,
				verifiedAt: organizationTelephony.verifiedAt,
				lastError: organizationTelephony.lastError,
				isTrial: organizationTelephony.isTrial,
				updatedAt: organizationTelephony.updatedAt,
			})
			.from(organizationTelephony)
			.where(eq(organizationTelephony.organizationId, organizationId))
			.limit(1);

		// Report which credentials would actually be used, so a workspace that
		// has configured nothing is not left guessing why calls still go out.
		const resolved = await resolveVoiceForOrg(db, organizationId, {
			audio: audioPublisher,
		}).catch(() => null);

		return {
			config: row ?? null,
			hasCredentials: Boolean(row?.authTokenLast4),
			activeProvider: resolved?.voice.name ?? null,
			activeSource: resolved?.source ?? null,
			problem: resolved?.problem ?? null,
		};
	}),

	/**
	 * Saves credentials.
	 *
	 * An omitted token means "keep the stored one", so editing the from-number
	 * does not require re-typing a secret the user cannot read back.
	 */
	update: tenantProcedure
		.input(
			z.object({
				provider: providerSchema,
				accountSid: z.string().trim().max(64).nullish(),
				authToken: z.string().trim().min(8).max(200).optional(),
				fromNumber: z.string().trim().max(32).nullish(),
				phoneNumberId: z.string().trim().max(64).nullish(),
				record: z.boolean().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const { db, organizationId, user } = context;

			let fromNumber: string | null = null;
			if (input.fromNumber) {
				const parsed = normalizePhone(input.fromNumber);
				if (!parsed.ok) {
					throw new ORPCError("BAD_REQUEST", {
						message: `From-number: ${parsed.reason}`,
					});
				}
				fromNumber = parsed.e164;
			}

			if (input.provider === "twilio" && !input.accountSid) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Twilio needs an account SID.",
				});
			}

			const [existing] = await db
				.select({ last4: organizationTelephony.authTokenLast4 })
				.from(organizationTelephony)
				.where(eq(organizationTelephony.organizationId, organizationId))
				.limit(1);

			if (input.provider !== "mock" && !input.authToken && !existing?.last4) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						input.provider === "twilio"
							? "Enter the Twilio auth token."
							: "Enter the Vapi API key.",
				});
			}

			const secretFields = input.authToken
				? {
						authTokenEncrypted: encryptSecret(input.authToken),
						authTokenLast4: secretHint(input.authToken),
					}
				: {};

			const values = {
				organizationId,
				provider: input.provider,
				accountSid: input.accountSid ?? null,
				fromNumber,
				phoneNumberId: input.phoneNumberId ?? null,
				record: input.record ?? true,
				// Any credential change invalidates the previous verification.
				verifiedAt: null,
				lastError: null,
				...secretFields,
			};

			const [saved] = await db
				.insert(organizationTelephony)
				.values(values)
				.onConflictDoUpdate({
					target: organizationTelephony.organizationId,
					set: values,
				})
				.returning({
					provider: organizationTelephony.provider,
					accountSid: organizationTelephony.accountSid,
					authTokenLast4: organizationTelephony.authTokenLast4,
					fromNumber: organizationTelephony.fromNumber,
					record: organizationTelephony.record,
				});

			await recordAudit(db, {
				organizationId,
				actor: { type: "USER", id: user.id },
				action: "telephony.updated",
				resourceType: "organization_telephony",
				resourceId: organizationId,
				metadata: {
					provider: input.provider,
					fromNumber,
					// Never the token itself, not even its length.
					credentialsChanged: Boolean(input.authToken),
				},
			});

			return saved;
		}),

	/**
	 * Tests the saved credentials against the provider.
	 *
	 * Reads back the stored secret rather than taking one from the request, so
	 * a green result means the thing that will actually place calls works — not
	 * that something typed into a form once did.
	 */
	test: tenantProcedure.handler(async ({ context }) => {
		const { db, organizationId, user } = context;

		const [row] = await db
			.select()
			.from(organizationTelephony)
			.where(eq(organizationTelephony.organizationId, organizationId))
			.limit(1);

		if (!row) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Nothing configured for this workspace yet.",
			});
		}

		if (row.provider === "mock") {
			return {
				ok: true,
				message: "Mock provider — calls are simulated, nothing is dialled.",
				isTrial: null,
				numbers: [] as string[],
			};
		}

		const secret = decryptSecret(row.authTokenEncrypted);

		if (!secret) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: "Stored credentials could not be read. Re-enter them.",
			});
		}

		let result: TwilioProbe;
		if (row.provider === "twilio") {
			result = await probeTwilio(
				row.accountSid as string,
				secret,
				row.fromNumber,
			);
		} else {
			const res = await fetch("https://api.vapi.ai/phone-number", {
				headers: { authorization: `Bearer ${secret}` },
			});
			const numbers = res.ok
				? ((await res.json()) as { number?: string }[])
						.map((n) => n.number)
						.filter((n): n is string => Boolean(n))
				: [];
			result = {
				ok: res.ok,
				message: res.ok
					? "Connected."
					: `Vapi returned ${res.status} for the phone-number lookup.`,
				isTrial: null,
				numbers,
			};
		}

		await db
			.update(organizationTelephony)
			.set({
				verifiedAt: result.ok ? new Date() : null,
				lastError: result.ok ? null : result.message,
				isTrial: result.isTrial,
			})
			.where(eq(organizationTelephony.organizationId, organizationId));

		await recordAudit(db, {
			organizationId,
			actor: { type: "USER", id: user.id },
			action: "telephony.tested",
			resourceType: "organization_telephony",
			resourceId: organizationId,
			reason: result.message,
			metadata: { ok: result.ok, provider: row.provider },
		});

		return result;
	}),

	/** Disconnects the workspace account, falling back to the shared one. */
	disconnect: tenantProcedure.handler(async ({ context }) => {
		const { db, organizationId, user } = context;

		await db
			.delete(organizationTelephony)
			.where(eq(organizationTelephony.organizationId, organizationId));

		await recordAudit(db, {
			organizationId,
			actor: { type: "USER", id: user.id },
			action: "telephony.disconnected",
			resourceType: "organization_telephony",
			resourceId: organizationId,
		});

		return { ok: true as const };
	}),
};
