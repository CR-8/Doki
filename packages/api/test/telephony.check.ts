import dotenv from "dotenv";

dotenv.config({ path: "../../apps/web/.env" });

const { decryptSecret, encryptSecret, secretHint } = await import(
	"@doki/connectors/crypto"
);
const { eq } = await import("drizzle-orm");
const { db, pgClient } = await import("@doki/db");
const { organization, organizationTelephony } = await import("@doki/db/schema");
const { resolveVoiceByAccountSid, resolveVoiceForOrg } = await import(
	"../src/lib/telephony"
);

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
	console.log(
		`${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
	);
	if (!ok) failures++;
}

// --- encryption round trip --------------------------------------------------
const SECRET = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
const sealed = encryptSecret(SECRET);

check(
	"encrypt produces a versioned envelope",
	sealed.startsWith("v1."),
	sealed.slice(0, 24),
);
check("ciphertext does not contain the plaintext", !sealed.includes(SECRET));
check("decrypt round-trips", decryptSecret(sealed) === SECRET);
check("hint is the last four characters", secretHint(SECRET) === "c5d6");

// Two encryptions of the same value must differ — a fixed IV would leak
// which workspaces share a token.
const sealedAgain = encryptSecret(SECRET);
check("nonce is random per call", sealed !== sealedAgain);

// Tampering must fail closed rather than return garbage.
const parts = sealed.split(".");
const flipped = Buffer.from(parts[3] as string, "base64url");
flipped[0] = (flipped[0] as number) ^ 0xff;
const tampered = [
	parts[0],
	parts[1],
	parts[2],
	flipped.toString("base64url"),
].join(".");
check("tampered ciphertext is rejected", decryptSecret(tampered) === null);
check("garbage is rejected", decryptSecret("not-an-envelope") === null);
check("null is rejected", decryptSecret(null) === null);

// --- resolution -------------------------------------------------------------
const [org] = await db
	.select({ id: organization.id, name: organization.name })
	.from(organization)
	.limit(1);

if (!org) {
	console.log("\nno workspace — skipping resolution checks");
	await pgClient.end();
	process.exit(failures === 0 ? 0 : 1);
}

console.log(`\nworkspace: ${org.name}`);

const before = await resolveVoiceForOrg(db, org.id);
check(
	"unconfigured workspace falls back to the environment",
	before.source === "environment",
	`provider=${before.voice.name}`,
);

const ROLLBACK = "rollback-sentinel";
const PROBE_SID = "ACprobe00000000000000000000000001";

try {
	// biome-ignore lint/suspicious/noExplicitAny: transaction handle
	await db.transaction(async (tx: any) => {
		await tx.insert(organizationTelephony).values({
			organizationId: org.id,
			provider: "twilio" as const,
			accountSid: PROBE_SID,
			authTokenEncrypted: encryptSecret(SECRET),
			authTokenLast4: secretHint(SECRET),
			fromNumber: "+919876543210",
			record: true,
		});

		const resolved = await resolveVoiceForOrg(tx, org.id);
		check(
			"configured workspace uses its own account",
			resolved.source === "workspace" && resolved.voice.name === "twilio",
			`source=${resolved.source} provider=${resolved.voice.name}`,
		);
		check("no problem reported", resolved.problem === null);

		const bySid = await resolveVoiceByAccountSid(tx, PROBE_SID);
		check(
			"webhook resolves the workspace by account SID",
			bySid !== null && bySid.name === "twilio",
		);

		const unknown = await resolveVoiceByAccountSid(tx, "ACunknown");
		check("unknown SID resolves to nothing", unknown === null);

		// A row whose secret cannot be read must degrade, not throw.
		await tx
			.update(organizationTelephony)
			.set({ authTokenEncrypted: "v1.corrupt.corrupt.corrupt" })
			.where(eq(organizationTelephony.organizationId, org.id));

		const broken = await resolveVoiceForOrg(tx, org.id);
		check(
			"undecryptable credentials fall back with a reason",
			broken.source === "environment" && broken.problem !== null,
			broken.problem ?? "",
		);

		throw new Error(ROLLBACK);
	});
} catch (error) {
	if ((error as Error).message !== ROLLBACK) throw error;
	console.log("rolled back — no changes persisted");
}

const [leftover] = await db
	.select({ organizationId: organizationTelephony.organizationId })
	.from(organizationTelephony)
	.where(eq(organizationTelephony.organizationId, org.id))
	.limit(1);
check("probe row did not persist", !leftover);

await pgClient.end();
console.log(
	failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
