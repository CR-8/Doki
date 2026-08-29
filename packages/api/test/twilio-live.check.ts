import dotenv from "dotenv";

dotenv.config({ path: "../../apps/web/.env" });

const { decryptSecret } = await import("@doki/connectors/crypto");
const { db, pgClient } = await import("@doki/db");
const { organizationTelephony } = await import("@doki/db/schema");

/**
 * Asks Twilio what the stored credentials can actually call from.
 *
 * A live diagnostic, not a test: it exists to answer "why is my number being
 * rejected" with Twilio's own answer rather than a guess.
 */
const [row] = await db.select().from(organizationTelephony).limit(1);

if (!row) {
	console.log("no telephony configured for any workspace");
	await pgClient.end();
	process.exit(0);
}

console.log(`provider   : ${row.provider}`);
console.log(`accountSid : ${row.accountSid}`);
console.log(`fromNumber : ${row.fromNumber}`);
console.log(`token hint : ****${row.authTokenLast4}`);

const token = decryptSecret(row.authTokenEncrypted);
console.log(`decrypt    : ${token ? "ok" : "FAILED"}`);

if (!token || !row.accountSid) {
	await pgClient.end();
	process.exit(1);
}

const auth = Buffer.from(`${row.accountSid}:${token}`).toString("base64");
const headers = { authorization: `Basic ${auth}` };
const base = `https://api.twilio.com/2010-04-01/Accounts/${row.accountSid}`;

const accountRes = await fetch(`${base}.json`, { headers });
const account = (await accountRes.json()) as { type?: string; status?: string };
console.log(
	`\naccount    : HTTP ${accountRes.status} type=${account.type} status=${account.status}`,
);

const [numbersRes, callerIdRes] = await Promise.all([
	fetch(`${base}/IncomingPhoneNumbers.json?PageSize=50`, { headers }),
	fetch(`${base}/OutgoingCallerIds.json?PageSize=50`, { headers }),
]);

const owned =
	(
		(await numbersRes.json()) as {
			incoming_phone_numbers?: { phone_number: string }[];
		}
	).incoming_phone_numbers?.map((n) => n.phone_number) ?? [];

const callerIds =
	(
		(await callerIdRes.json()) as {
			outgoing_caller_ids?: { phone_number: string }[];
		}
	).outgoing_caller_ids?.map((n) => n.phone_number) ?? [];

console.log(`owned numbers      : ${owned.join(", ") || "none"}`);
console.log(`verified callerIds : ${callerIds.join(", ") || "none"}`);

const usable = [...new Set([...owned, ...callerIds])];
console.log(`usable as From     : ${usable.join(", ") || "none"}`);

if (row.fromNumber) {
	const ok = usable.includes(row.fromNumber);
	console.log(
		`\nstored from-number accepted? ${ok ? "YES" : "NO"}${
			ok
				? owned.includes(row.fromNumber)
					? " (owned number)"
					: " (verified caller ID)"
				: ""
		}`,
	);
}

// --- subaccounts ------------------------------------------------------------
//
// A number missing from the main account is most often sitting on a subaccount.
// Worth checking before concluding it is not there at all.
const subsRes = await fetch(
	"https://api.twilio.com/2010-04-01/Accounts.json?PageSize=50",
	{ headers },
);
const subs =
	(
		(await subsRes.json()) as {
			accounts?: { sid: string; friendly_name: string; status: string }[];
		}
	).accounts ?? [];

const others = subs.filter((a) => a.sid !== row.accountSid);
console.log(`
subaccounts: ${others.length}`);

for (const sub of others) {
	const subBase = `https://api.twilio.com/2010-04-01/Accounts/${sub.sid}`;
	const [n, c] = await Promise.all([
		fetch(`${subBase}/IncomingPhoneNumbers.json?PageSize=50`, { headers }),
		fetch(`${subBase}/OutgoingCallerIds.json?PageSize=50`, { headers }),
	]);
	const subOwned = n.ok
		? ((await n.json()) as { incoming_phone_numbers?: { phone_number: string }[] })
				.incoming_phone_numbers?.map((x) => x.phone_number) ?? []
		: [];
	const subCallers = c.ok
		? ((await c.json()) as { outgoing_caller_ids?: { phone_number: string }[] })
				.outgoing_caller_ids?.map((x) => x.phone_number) ?? []
		: [];
	console.log(
		`   ${sub.friendly_name} (${sub.sid}, ${sub.status}) owned=[${subOwned.join(", ")}] callerIds=[${subCallers.join(", ")}]`,
	);
}

await pgClient.end();
