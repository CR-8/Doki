import {
	type CountryCode,
	parsePhoneNumberFromString,
} from "libphonenumber-js";

export type PhoneNormalizationResult =
	| { ok: true; e164: string; country: CountryCode; national: string }
	| { ok: false; reason: string };

/**
 * Normalise a customer-supplied phone number to E.164.
 *
 * Indian lead lists arrive in every imaginable shape: "98765 43210",
 * "+91-9876543210", "09876543210", "919876543210". All of these must collapse
 * to one canonical value, because `lead.phone_e164` is the dedupe key AND the
 * key the suppression list is checked against. A number that normalises
 * inconsistently is a number that can be called after opting out.
 */
export function normalizePhone(
	raw: string,
	defaultCountry: CountryCode = "IN",
): PhoneNormalizationResult {
	const trimmed = (raw ?? "").trim();
	if (!trimmed) return { ok: false, reason: "Phone number is empty" };

	const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
	if (!parsed) return { ok: false, reason: "Could not parse phone number" };
	if (!parsed.isValid())
		return { ok: false, reason: "Not a valid phone number" };

	return {
		ok: true,
		e164: parsed.number,
		country: (parsed.country ?? defaultCountry) as CountryCode,
		national: parsed.nationalNumber,
	};
}

/**
 * Best-effort IANA timezone for a number. India is a single zone, so this is
 * exact for +91 and deliberately conservative elsewhere — an unknown zone
 * falls back to the workspace default rather than guessing wrong and calling
 * someone at 3am.
 */
export function timezoneForPhone(e164: string, fallback: string): string {
	if (e164.startsWith("+91")) return "Asia/Kolkata";
	return fallback;
}

/** Masks a number for display in logs and audit trails: +9198*****210 */
export function maskPhone(e164: string): string {
	if (e164.length < 7) return "***";
	return `${e164.slice(0, 5)}*****${e164.slice(-3)}`;
}
