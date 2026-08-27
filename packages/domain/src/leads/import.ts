import { normalizePhone, timezoneForPhone } from "../phone";

/**
 * Minimal RFC 4180 parser.
 *
 * Written rather than pulled in because the failure modes that matter here are
 * specific: an Indian lead list routinely contains commas inside company names
 * and quoted phone numbers, and a naive `split(",")` silently shifts every
 * column after the first offending row — producing leads with a company name
 * in the phone field, which then fail to normalise for reasons nobody can see.
 */
export function parseCsv(input: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;

	// Strip a UTF-8 BOM; Excel adds one and it corrupts the first header.
	const text = input.replace(/^﻿/, "");

	for (let i = 0; i < text.length; i++) {
		const char = text[i];

		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
			continue;
		}

		if (char === '"') {
			inQuotes = true;
		} else if (char === ",") {
			row.push(field);
			field = "";
		} else if (char === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else if (char === "\r") {
			// Handled by the \n branch; CRLF and LF both terminate a record.
		} else {
			field += char;
		}
	}

	if (field !== "" || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	// Drop only TRAILING blank lines. An interior blank row must be preserved,
	// because dropping it would shift every subsequent row number — and those
	// numbers are how a user finds the offending line in their spreadsheet.
	let end = rows.length;
	while (end > 0 && (rows[end - 1] ?? []).every((cell) => cell.trim() === "")) {
		end--;
	}
	return rows.slice(0, end);
}

export type LeadColumn = "name" | "phone" | "email" | "company" | "source";

/** Header spellings seen in real exports, normalised to our field names. */
const HEADER_ALIASES: Record<string, LeadColumn> = {
	name: "name",
	"full name": "name",
	fullname: "name",
	"lead name": "name",
	"contact name": "name",
	"customer name": "name",
	"first name": "name",
	firstname: "name",

	phone: "phone",
	"phone number": "phone",
	phonenumber: "phone",
	mobile: "phone",
	"mobile number": "phone",
	contact: "phone",
	"contact number": "phone",
	number: "phone",
	msisdn: "phone",
	whatsapp: "phone",

	email: "email",
	"email address": "email",
	"e-mail": "email",
	mail: "email",

	company: "company",
	"company name": "company",
	organisation: "company",
	organization: "company",
	business: "company",
	firm: "company",

	source: "source",
	"lead source": "source",
	campaign: "source",
	utm_source: "source",
};

export type ColumnMapping = Partial<Record<LeadColumn, number>>;

/** Best-effort header detection. The UI lets the user correct it. */
export function detectColumns(header: string[]): ColumnMapping {
	const mapping: ColumnMapping = {};
	header.forEach((raw, index) => {
		const key = raw.trim().toLowerCase().replace(/[_-]+/g, " ");
		const field = HEADER_ALIASES[key];
		if (field && mapping[field] === undefined) mapping[field] = index;
	});
	return mapping;
}

export type ParsedLead = {
	/** 1-based row number in the original file, for error reporting. */
	row: number;
	name: string | null;
	company: string | null;
	email: string | null;
	phoneRaw: string;
	phoneE164: string;
	phoneCountry: string;
	source: string | null;
	timezone: string;
};

export type RejectedRow = {
	row: number;
	reason: string;
	value: string;
};

export type ImportPreview = {
	valid: ParsedLead[];
	/** Rows that could not be used at all. */
	rejected: RejectedRow[];
	/** Rows dropped because the same number appears earlier in this file. */
	duplicatesInFile: RejectedRow[];
	totalRows: number;
	mapping: ColumnMapping;
	headers: string[];
};

function cell(row: string[], index: number | undefined): string {
	if (index === undefined) return "";
	return (row[index] ?? "").trim();
}

/**
 * Turns raw CSV text into leads ready for insertion.
 *
 * Deliberately does not touch the database: this runs identically in a preview
 * (so the user sees exactly what will happen before committing) and in the
 * commit itself. Every rejection carries a row number, because "37 rows failed"
 * with no indication of which is useless to someone fixing a spreadsheet.
 */
export function parseLeadCsv(
	input: string,
	options: {
		defaultCountry?: "IN";
		defaultTimezone?: string;
		mapping?: ColumnMapping;
	} = {},
): ImportPreview {
	const defaultTimezone = options.defaultTimezone ?? "Asia/Kolkata";
	const rows = parseCsv(input);

	if (rows.length === 0) {
		return {
			valid: [],
			rejected: [],
			duplicatesInFile: [],
			totalRows: 0,
			mapping: {},
			headers: [],
		};
	}

	const headers = (rows[0] ?? []).map((h) => h.trim());
	const mapping = options.mapping ?? detectColumns(headers);

	const valid: ParsedLead[] = [];
	const rejected: RejectedRow[] = [];
	const duplicatesInFile: RejectedRow[] = [];
	const seen = new Set<string>();

	if (mapping.phone === undefined) {
		return {
			valid: [],
			rejected: [
				{
					row: 1,
					reason:
						"No phone column found. Expected a header like 'phone' or 'mobile'.",
					value: headers.join(", "),
				},
			],
			duplicatesInFile: [],
			totalRows: rows.length - 1,
			mapping,
			headers,
		};
	}

	for (let i = 1; i < rows.length; i++) {
		const row = rows[i] ?? [];
		const rowNumber = i + 1;
		const rawPhone = cell(row, mapping.phone);

		if (!rawPhone) {
			rejected.push({
				row: rowNumber,
				reason: "Missing phone number",
				value: "",
			});
			continue;
		}

		const phone = normalizePhone(rawPhone, options.defaultCountry ?? "IN");
		if (!phone.ok) {
			rejected.push({ row: rowNumber, reason: phone.reason, value: rawPhone });
			continue;
		}

		// Within-file duplicates are caught here so the batch insert does not
		// have to reason about them; cross-file duplicates are handled by the
		// unique index at commit time.
		if (seen.has(phone.e164)) {
			duplicatesInFile.push({
				row: rowNumber,
				reason: "Duplicate of an earlier row in this file",
				value: phone.e164,
			});
			continue;
		}
		seen.add(phone.e164);

		const email = cell(row, mapping.email);

		valid.push({
			row: rowNumber,
			name: cell(row, mapping.name) || null,
			company: cell(row, mapping.company) || null,
			// A malformed email should not cost you the lead — drop the field,
			// keep the row, since the phone number is what actually matters.
			email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
			phoneRaw: rawPhone,
			phoneE164: phone.e164,
			phoneCountry: phone.country,
			source: cell(row, mapping.source) || null,
			timezone: timezoneForPhone(phone.e164, defaultTimezone),
		});
	}

	return {
		valid,
		rejected,
		duplicatesInFile,
		totalRows: rows.length - 1,
		mapping,
		headers,
	};
}
