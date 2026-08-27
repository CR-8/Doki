import { timingSafeEqual } from "node:crypto";

import { audioPublisher } from "@doki/api/lib/audio-publisher";
import { getVoiceProvider } from "@doki/connectors/voice/index";
import { db } from "@doki/db";
import { drainFollowUps } from "@doki/domain";
import { env } from "@doki/env/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Draining a batch places real calls; give it room. */
export const maxDuration = 300;

function authorized(request: Request): boolean {
	const expected = env.CRON_SECRET;
	// Fail closed: an unset secret must never mean "anyone may drain the queue".
	if (!expected) return false;

	const header = request.headers.get("authorization") ?? "";
	const received = header.replace(/^Bearer\s+/i, "");

	const a = Buffer.from(received);
	const b = Buffer.from(expected);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

/**
 * Drains due follow-ups.
 *
 * Safe if two invocations overlap: the runner claims rows with
 * FOR UPDATE SKIP LOCKED, so concurrent calls take disjoint work rather than
 * double-dialling the same lead.
 */
export async function GET(request: Request): Promise<Response> {
	if (!authorized(request)) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	let voice: ReturnType<typeof getVoiceProvider>;
	try {
		voice = getVoiceProvider({ audio: audioPublisher });
	} catch (error) {
		return Response.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Voice provider not configured",
			},
			{ status: 500 },
		);
	}

	// External schedulers are explicit about wanting a run, so they bypass the
	// interval guard the console heartbeat relies on.
	const outcome = await drainFollowUps(db, voice, {
		triggeredBy: "cron",
		force: true,
		limit: 25,
	});

	if (!outcome.ran)
		return Response.json({ ok: true, ran: false, reason: outcome.reason });

	return Response.json({
		ok: true,
		ran: true,
		...outcome.result,
		reclaimed: outcome.reclaimed,
	});
}

/** Same behaviour for schedulers that trigger with POST. */
export async function POST(request: Request): Promise<Response> {
	return GET(request);
}
