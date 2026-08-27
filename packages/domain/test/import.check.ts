// biome-ignore-all lint/complexity/noUselessLoneBlockStatements: blocks scope each test group's locals
import { detectColumns, parseCsv, parseLeadCsv } from "../src/leads/import";

let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (ok) {
		pass++;
		console.log(`  ok   ${label}`);
	} else {
		fail++;
		console.log(
			`  FAIL ${label}\n         expected ${JSON.stringify(expected)}\n         actual   ${JSON.stringify(actual)}`,
		);
	}
}

console.log("\nCSV parsing (the shapes real exports actually have):");
{
	check("plain rows", parseCsv("a,b\n1,2"), [
		["a", "b"],
		["1", "2"],
	]);

	// The case a naive split(",") silently corrupts.
	check(
		"comma inside a quoted field",
		parseCsv('name,company\nRohan,"Acme Pvt Ltd, Mumbai"'),
		[
			["name", "company"],
			["Rohan", "Acme Pvt Ltd, Mumbai"],
		],
	);

	check('escaped "" inside quotes', parseCsv('a\n"He said ""hi"""'), [
		["a"],
		['He said "hi"'],
	]);

	check("CRLF line endings", parseCsv("a,b\r\n1,2\r\n"), [
		["a", "b"],
		["1", "2"],
	]);

	// Excel prepends a BOM, which would otherwise corrupt the first header.
	check("UTF-8 BOM stripped", parseCsv("﻿phone\n98765 43210")[0], ["phone"]);

	check("blank trailing lines dropped", parseCsv("a\n1\n\n\n").length, 2);
	check("empty input", parseCsv(""), []);
}

console.log("\nHeader detection:");
{
	check("common headers", detectColumns(["Name", "Phone", "Email"]), {
		name: 0,
		phone: 1,
		email: 2,
	});
	check(
		"aliases and casing",
		detectColumns(["Full Name", "Mobile Number", "Company Name"]),
		{
			name: 0,
			phone: 1,
			company: 2,
		},
	);
	check(
		"underscores normalised",
		detectColumns(["lead_source", "contact_number"]),
		{
			source: 0,
			phone: 1,
		},
	);
	check("unknown columns ignored", detectColumns(["notes", "phone"]), {
		phone: 1,
	});
}

console.log("\nLead extraction:");
{
	const csv = [
		"Name,Mobile,Email,Company",
		"Rohan Sharma,98765 43210,rohan@acme.in,Acme",
		'Priya Iyer,+91-9876543211,priya@acme.in,"Beta Corp, Pune"',
		"Amit,09876543212,not-an-email,Gamma",
		"Bad Row,12,x@y.com,Delta",
		",,,",
		"Dupe,9876543210,dupe@acme.in,Acme",
	].join("\n");

	const result = parseLeadCsv(csv);

	check("valid rows extracted", result.valid.length, 3);
	check("total data rows counted", result.totalRows, 6);

	// Every format must collapse to the same canonical value.
	check(
		"phones normalised to E.164",
		result.valid.map((l) => l.phoneE164),
		["+919876543210", "+919876543211", "+919876543212"],
	);

	check(
		"quoted company with comma survives",
		result.valid[1]?.company,
		"Beta Corp, Pune",
	);

	// A bad email costs the field, not the lead — the phone is what matters.
	check("malformed email dropped, row kept", result.valid[2]?.email, null);
	check("that row is still valid", result.valid[2]?.name, "Amit");

	check(
		"unparseable phone rejected",
		result.rejected.some((r) => r.value === "12"),
		true,
	);
	check(
		"blank row rejected",
		result.rejected.some((r) => r.reason === "Missing phone number"),
		true,
	);

	// The duplicate is written differently but normalises to row 2's number.
	check("in-file duplicate caught", result.duplicatesInFile.length, 1);
	check(
		"duplicate reported by normalised value",
		result.duplicatesInFile[0]?.value,
		"+919876543210",
	);

	// Row numbers must match the spreadsheet so a human can find them.
	check("rejection carries its row number", result.rejected[0]?.row, 5);
	check("duplicate carries its row number", result.duplicatesInFile[0]?.row, 7);

	check("timezone inferred for +91", result.valid[0]?.timezone, "Asia/Kolkata");
}

console.log("\nFailure handling:");
{
	const noPhone = parseLeadCsv("name,email\nRohan,r@acme.in");
	check(
		"file without a phone column is rejected wholesale",
		noPhone.valid.length,
		0,
	);
	check(
		"and says why",
		noPhone.rejected[0]?.reason.includes("No phone column"),
		true,
	);

	const empty = parseLeadCsv("");
	check(
		"empty file yields nothing",
		[empty.valid.length, empty.totalRows],
		[0, 0],
	);

	// An explicit mapping must override detection, for files with odd headers.
	const odd = parseLeadCsv("col1,col2\nRohan,9876543210", {
		mapping: { name: 0, phone: 1 },
	});
	check(
		"explicit mapping overrides detection",
		odd.valid[0]?.phoneE164,
		"+919876543210",
	);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
