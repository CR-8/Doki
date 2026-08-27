/**
 * Calling-hours arithmetic, evaluated in the LEAD's timezone rather than the
 * server's. TCCCPR restricts promotional calling to 09:00–21:00 local time,
 * and "local" means where the person receiving the call is.
 *
 * Uses Intl rather than a date library — no dependency, and it is correct
 * across DST because the zone rules come from the platform's tz database.
 */

export type ClockTime = { hour: number; minute: number; second: number };

export type LocalMoment = {
	/** 0 = Sunday … 6 = Saturday, in the target timezone. */
	weekday: number;
	time: ClockTime;
};

const WEEKDAY_INDEX: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
};

/** Parses a Postgres `time` value ("09:00:00") into components. */
export function parseClockTime(value: string): ClockTime {
	const [h = "0", m = "0", s = "0"] = value.split(":");
	return { hour: Number(h), minute: Number(m), second: Number(s) };
}

export function toSeconds(t: ClockTime): number {
	return t.hour * 3600 + t.minute * 60 + t.second;
}

/** Resolves an instant into wall-clock time and weekday in a given IANA zone. */
export function localMoment(instant: Date, timeZone: string): LocalMoment {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).formatToParts(instant);

	const get = (type: string) =>
		parts.find((p) => p.type === type)?.value ?? "0";
	// Intl renders midnight as "24" in some environments; normalise it.
	const hour = Number(get("hour")) % 24;

	return {
		weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
		time: {
			hour,
			minute: Number(get("minute")),
			second: Number(get("second")),
		},
	};
}

export type WindowCheck = {
	insideWindow: boolean;
	isWeekend: boolean;
	localTime: ClockTime;
	weekday: number;
	/** Next instant the window opens, if currently closed. */
	nextOpenAt: Date | null;
};

/**
 * Evaluates whether `instant` falls inside the allowed calling window for a
 * lead in `timeZone`. Windows that wrap past midnight are not supported by
 * design — a legal calling window never does.
 */
export function checkCallingWindow(input: {
	instant: Date;
	timeZone: string;
	windowStart: string;
	windowEnd: string;
	allowWeekend: boolean;
}): WindowCheck {
	const { instant, timeZone, windowStart, windowEnd, allowWeekend } = input;

	const { weekday, time } = localMoment(instant, timeZone);
	const start = parseClockTime(windowStart);
	const end = parseClockTime(windowEnd);

	const nowSec = toSeconds(time);
	const startSec = toSeconds(start);
	const endSec = toSeconds(end);

	const isWeekend = weekday === 0 || weekday === 6;
	const withinHours = nowSec >= startSec && nowSec < endSec;
	const weekendOk = allowWeekend || !isWeekend;
	const insideWindow = withinHours && weekendOk;

	return {
		insideWindow,
		isWeekend,
		localTime: time,
		weekday,
		nextOpenAt: insideWindow
			? null
			: nextWindowOpen({
					instant,
					timeZone,
					start,
					nowSec,
					startSec,
					endSec,
					allowWeekend,
				}),
	};
}

function nextWindowOpen(input: {
	instant: Date;
	timeZone: string;
	start: ClockTime;
	nowSec: number;
	startSec: number;
	endSec: number;
	allowWeekend: boolean;
}): Date {
	const { instant, timeZone, nowSec, startSec, endSec, allowWeekend } = input;

	// If the window has not opened yet today, it opens later today; otherwise
	// the next candidate is tomorrow.
	let daysAhead = nowSec < startSec ? 0 : 1;
	if (nowSec >= startSec && nowSec < endSec) daysAhead = 0;

	for (let i = 0; i < 8; i++) {
		const candidate = shiftToLocalTime(
			instant,
			timeZone,
			input.start,
			daysAhead + i,
		);
		if (candidate.getTime() <= instant.getTime()) continue;
		const { weekday } = localMoment(candidate, timeZone);
		const isWeekend = weekday === 0 || weekday === 6;
		if (isWeekend && !allowWeekend) continue;
		return candidate;
	}

	// Unreachable in practice; keeps the return type non-nullable.
	return new Date(instant.getTime() + 24 * 3600 * 1000);
}

/**
 * Produces the UTC instant corresponding to a given wall-clock time, N days
 * ahead, in `timeZone`. Derives the zone offset by comparing the formatted
 * local time back against UTC, so it stays correct across DST boundaries.
 */
function shiftToLocalTime(
	instant: Date,
	timeZone: string,
	target: ClockTime,
	daysAhead: number,
): Date {
	const base = new Date(instant.getTime() + daysAhead * 24 * 3600 * 1000);
	const local = localMoment(base, timeZone);
	const deltaSeconds = toSeconds(target) - toSeconds(local.time);
	return new Date(base.getTime() + deltaSeconds * 1000);
}

/** Formats a clock time for human-readable refusal messages. */
export function formatClockTime(t: ClockTime): string {
	const hh = String(t.hour).padStart(2, "0");
	const mm = String(t.minute).padStart(2, "0");
	return `${hh}:${mm}`;
}
