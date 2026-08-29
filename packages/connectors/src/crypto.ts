import {
	createCipheriv,
	createDecipheriv,
	hkdfSync,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";

import { env } from "@doki/env/server";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Derives the data key from the app secret.
 *
 * Deliberately derived rather than configured separately: adding a required
 * env var is a deployment break waiting to happen, and this system already
 * treats `BETTER_AUTH_SECRET` as its root secret. The salt and info labels
 * domain-separate this key from anything else derived from the same secret.
 *
 * Consequence worth knowing: rotating `BETTER_AUTH_SECRET` makes existing
 * ciphertexts undecryptable. Stored credentials must be re-entered after a
 * rotation, which `decryptSecret` reports as a clean failure rather than a
 * crash.
 */
let cachedKey: Buffer | null = null;

function dataKey(): Buffer {
	if (cachedKey) return cachedKey;

	const derived = hkdfSync(
		"sha256",
		Buffer.from(env.BETTER_AUTH_SECRET, "utf8"),
		Buffer.from("doki.telephony.v1", "utf8"),
		Buffer.from("aes-256-gcm credential encryption", "utf8"),
		KEY_BYTES,
	);

	cachedKey = Buffer.from(derived);
	return cachedKey;
}

/**
 * Encrypts a credential for storage.
 *
 * Format is `v1.<iv>.<tag>.<ciphertext>`, all base64url. The version prefix
 * exists so a future scheme can be introduced without guessing at what a bare
 * blob was encrypted with.
 */
export function encryptSecret(plaintext: string): string {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, dataKey(), iv);

	const ciphertext = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();

	return [
		VERSION,
		iv.toString("base64url"),
		tag.toString("base64url"),
		ciphertext.toString("base64url"),
	].join(".");
}

/**
 * Decrypts a stored credential.
 *
 * Returns null rather than throwing on any failure — wrong key after a secret
 * rotation, truncated column, tampered ciphertext. Callers must treat that as
 * "no credential configured", which degrades to the environment fallback
 * instead of taking the whole app down.
 */
export function decryptSecret(stored: string | null): string | null {
	if (!stored) return null;

	const parts = stored.split(".");
	if (parts.length !== 4 || parts[0] !== VERSION) return null;

	try {
		const iv = Buffer.from(parts[1] as string, "base64url");
		const tag = Buffer.from(parts[2] as string, "base64url");
		const ciphertext = Buffer.from(parts[3] as string, "base64url");

		if (iv.length !== IV_BYTES) return null;

		const decipher = createDecipheriv(ALGORITHM, dataKey(), iv);
		decipher.setAuthTag(tag);

		return Buffer.concat([
			decipher.update(ciphertext),
			decipher.final(),
		]).toString("utf8");
	} catch {
		return null;
	}
}

/** Last four characters, for showing which credential is on file. */
export function secretHint(plaintext: string): string {
	return plaintext.slice(-4);
}

/** Constant-time comparison, for anywhere a secret is checked by equality. */
export function secretsMatch(a: string, b: string): boolean {
	const left = Buffer.from(a, "utf8");
	const right = Buffer.from(b, "utf8");
	if (left.length !== right.length) return false;
	return timingSafeEqual(left, right);
}
