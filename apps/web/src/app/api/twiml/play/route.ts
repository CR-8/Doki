import { db } from "@doki/db";
import { ttsAsset } from "@doki/db/schema";
import { and, eq, gt } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function twiml(body: string): Response {
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
		{
			status: 200,
			headers: { "content-type": "text/xml; charset=utf-8" },
		},
	);
}

/**
 * Serves the call script to Twilio.
 *
 * Exists because inline `Twiml` is a paid-only parameter — trial accounts
 * reject it outright — so the document has to be fetched from a URL instead.
 *
 * Deliberately unauthenticated: Twilio fetches this during call setup and
 * cannot present a session. Protection comes from the asset id being an
 * unguessable UUID with a hard expiry, and the response contains nothing but
 * a link to audio that is already served from an equally unguessable URL.
 *
 * Always returns valid TwiML. A 4xx here makes Twilio fail the call with an
 * opaque error; a spoken apology is far easier to diagnose from a recording.
 */
async function handler(request: Request): Promise<Response> {
	const assetId = new URL(request.url).searchParams.get("a") ?? "";

	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			assetId,
		)
	) {
		return twiml("<Hangup/>");
	}

	const [asset] = await db
		.select({ id: ttsAsset.id })
		.from(ttsAsset)
		.where(and(eq(ttsAsset.id, assetId), gt(ttsAsset.expiresAt, new Date())))
		.limit(1);

	if (!asset) return twiml("<Hangup/>");

	const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
	const audioUrl = `${appUrl}/api/audio/${asset.id}.mp3`;

	return twiml(
		`<Play>${escapeXml(audioUrl)}</Play><Pause length="1"/><Hangup/>`,
	);
}

/** Twilio POSTs by default; GET is accepted for manual verification. */
export async function POST(request: Request): Promise<Response> {
	return handler(request);
}

export async function GET(request: Request): Promise<Response> {
	return handler(request);
}
