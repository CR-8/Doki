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

/** What Twilio reports about an account, before any judgement is applied. */
type TwilioAccount = {
	reachable: boolean;
	/** Set when Twilio answered but refused; null when it could not be reached. */
	error: string | null;
	isTrial: boolean | null;
	/** Numbers the account owns. */
	numbers: string[];
	/** Outside numbers verified for outbound caller ID. Also valid as `From`. */
	callerIds: string[];
};

/** Every number Twilio will accept as a `From` on this account. */
function callableFrom(account: TwilioAccount): string[] {
	return [...new Set([...account.numbers, ...account.callerIds])];
}

/**
 * Asks Twilio what this account is and which numbers it owns.
 *
 * Uses the REST API rather than the SDK so this stays a plain fetch with no
 * client construction: the point is to report exactly what Twilio said. It
 * makes no judgement about whether the configuration is usable — callers do
 * that, because "no numbers owned" is fatal for placing a call but perfectly
 * fine when the user is still filling the form in.
 */
async function describeTwilioAccount(
	accountSid: string,
	authToken: string,
): Promise<TwilioAccount> {
	const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
	const headers = { authorization: `Basic ${auth}` };

	let accountRes: Response;
	try {
		accountRes = await fetch(
			`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`,
			{ headers },
		);
	} catch {
		// Could not reach Twilio at all — distinct from Twilio saying no.
		return {
			reachable: false,
			error: null,
			isTrial: null,
			numbers: [],
			callerIds: [],
		};
	}

	if (accountRes.status === 401) {
		return {
			reachable: true,
			error: "Twilio rejected these credentials.",
			isTrial: null,
			numbers: [],
			callerIds: [],
		};
	}
	if (!accountRes.ok) {
		return {
			reachable: true,
			error: `Twilio returned ${accountRes.status} for the account lookup.`,
			isTrial: null,
			numbers: [],
			callerIds: [],
		};
	}

	const account = (await accountRes.json()) as { type?: string };
	const isTrial = account.type === "Trial";

	// Both lists matter: Twilio accepts a `From` that is either a number the
	// account owns or an outside number verified as an outgoing caller ID.
	// Checking only the first rejects a perfectly valid configuration.
	const [numbersRes, callerIdRes] = await Promise.all([
		fetch(
			`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/IncomingPhoneNumbers.json?PageSize=50`,
			{ headers },
		),
		fetch(
			`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/OutgoingCallerIds.json?PageSize=50`,
			{ headers },
		),
	]);

	const numbers: string[] = numbersRes.ok
		? ((
				(await numbersRes.json()) as {
					incoming_phone_numbers?: { phone_number: string }[];
				}
			).incoming_phone_numbers?.map((n) => n.phone_number) ?? [])
		: [];

	const callerIds: string[] = callerIdRes.ok
		? ((
				(await callerIdRes.json()) as {
					outgoing_caller_ids?: { phone_number: string }[];
				}
			).outgoing_caller_ids?.map((n) => n.phone_number) ?? [])
		: [];

	return { reachable: true, error: null, isTrial, numbers, callerIds };
}

/**
 * Judges whether an account is ready to place calls.
 *
 * Owning zero numbers is a failure because a call cannot be placed without
 * one, however valid the credentials are.
 */
async function probeTwilio(
	accountSid: string,
	authToken: string,
	fromNumber: string | null,
): Promise<TwilioProbe> {
	const account = await describeTwilioAccount(accountSid, authToken);

	if (!account.reachable) {
		return {
			ok: false,
			message: "Could not reach Twilio. Check the network and try again.",
			isTrial: null,
			numbers: [],
		};
	}

	if (account.error) {
		return {
			ok: false,
			message: account.error,
			isTrial: account.isTrial,
			numbers: account.numbers,
		};
	}

	const usable = callableFrom(account);

	if (usable.length === 0) {
		return {
			ok: false,
			message:
				"These credentials work, but the account has no number to call from. Buy a Twilio number or verify an outgoing caller ID.",
			isTrial: account.isTrial,
			numbers: usable,
		};
	}

	if (!fromNumber) {
		return {
			ok: false,
			message: `No calling number chosen. This account can call from ${usable.join(", ")}.`,
			isTrial: account.isTrial,
			numbers: usable,
		};
	}

	if (!usable.includes(fromNumber)) {
		return {
			ok: false,
			message: `Twilio does not list ${fromNumber} on this account. It can call from ${usable.join(", ")}. If you own it on another account or subaccount, use those credentials instead.`,
			isTrial: account.isTrial,
			numbers: usable,
		};
	}

	const viaCallerId =
		!account.numbers.includes(fromNumber) &&
		account.callerIds.includes(fromNumber);

	return {
		ok: true,
		message: account.isTrial
			? `Connected${viaCallerId ? " using a verified caller ID" : ""}. This is a trial account, so calls run with a reduced parameter set and can only reach numbers you have verified with Twilio.`
			: `Connected${viaCallerId ? " using a verified caller ID" : ""}.`,
		isTrial: account.isTrial,
		numbers: usable,
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

			// Flag a from-number Twilio does not recognise, but never refuse the
			// save over it. This check cannot see every legitimate case — a
			// subaccount, a caller ID verified seconds ago, a number ported
			// mid-transfer — and a remote lookup that is merely incomplete has no
			// business standing between someone and their own configuration.
			// Saving records intent; Test connection is what establishes truth.
			let warning: string | null = null;

			if (input.provider === "twilio" && fromNumber && input.accountSid) {
				const [stored] = await db
					.select({ enc: organizationTelephony.authTokenEncrypted })
					.from(organizationTelephony)
					.where(eq(organizationTelephony.organizationId, organizationId))
					.limit(1);

				const token = input.authToken ?? decryptSecret(stored?.enc ?? null);
				if (token) {
					const account = await describeTwilioAccount(input.accountSid, token);
					const usable = callableFrom(account);
					if (
						account.reachable &&
						!account.error &&
						usable.length > 0 &&
						!usable.includes(fromNumber)
					) {
						warning = `Saved, but Twilio does not list ${fromNumber} on this account. It reports ${usable.join(", ")}. Calls will fail until this is resolved.`;
					}
				}
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

			if (warning) {
				await db
					.update(organizationTelephony)
					.set({ lastError: warning })
					.where(eq(organizationTelephony.organizationId, organizationId));
			}

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

			return { ...saved, warning };
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

	/**
	 * The numbers this workspace's account owns.
	 *
	 * Exists so the console can offer a choice instead of a text box: Twilio
	 * will only dial from a number the account holds, so free-typing one is an
	 * invitation to get it wrong. Returns an empty list rather than throwing
	 * when nothing is configured yet — the form falls back to manual entry.
	 */
	numbers: tenantProcedure.handler(async ({ context }) => {
		const { db, organizationId } = context;

		const [row] = await db
			.select()
			.from(organizationTelephony)
			.where(eq(organizationTelephony.organizationId, organizationId))
			.limit(1);

		if (row?.provider !== "twilio" || !row.accountSid) {
			return {
				numbers: [] as string[],
				owned: [] as string[],
				callerIds: [] as string[],
				isTrial: null,
				problem: null,
			};
		}

		const secret = decryptSecret(row.authTokenEncrypted);
		if (!secret) {
			return {
				numbers: [] as string[],
				owned: [] as string[],
				callerIds: [] as string[],
				isTrial: null,
				problem: "Stored credentials could not be read.",
			};
		}

		const account = await describeTwilioAccount(row.accountSid, secret);

		return {
			numbers: callableFrom(account),
			owned: account.numbers,
			callerIds: account.callerIds,
			isTrial: account.isTrial,
			problem: account.reachable
				? account.error
				: "Could not reach Twilio just now.",
		};
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
