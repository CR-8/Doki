import { db } from "@doki/db";
import { ttsAsset } from "@doki/db/schema";
import { and, eq, gt } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves synthesised speech to the carrier.
 *
 * Deliberately unauthenticated: Twilio fetches this URL directly and cannot
 * present a session. Protection comes from the id being an unguessable UUID
 * plus a hard expiry, and the response carries no customer data beyond the
 * spoken line itself. Move behind signed URLs when audio moves to S3.
 */
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await params;
	const assetId = id.replace(/\.mp3$/i, "");

	// Reject anything that is not a UUID before it reaches the database.
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			assetId,
		)
	) {
		return new Response("Not found", { status: 404 });
	}

	const [asset] = await db
		.select({ audioBase64: ttsAsset.audioBase64, mimeType: ttsAsset.mimeType })
		.from(ttsAsset)
		.where(and(eq(ttsAsset.id, assetId), gt(ttsAsset.expiresAt, new Date())))
		.limit(1);

	if (!asset) return new Response("Not found", { status: 404 });

	const audio = Buffer.from(asset.audioBase64, "base64");

	return new Response(new Uint8Array(audio), {
		status: 200,
		headers: {
			"content-type": asset.mimeType,
			"content-length": String(audio.byteLength),
			"accept-ranges": "bytes",
			"cache-control": "public, max-age=3600",
		},
	});
}
