import { handleVoiceWebhook } from "@/lib/voice-webhook";

/** Needs Node's crypto for Twilio's HMAC-SHA1 signature check. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Post-call analysis runs past the response via waitUntil. */
export const maxDuration = 60;

/**
 * Receives both call-status and recording-status callbacks. Twilio ignores the
 * response body for status callbacks, so a plain JSON acknowledgement is fine.
 */
export async function POST(request: Request): Promise<Response> {
	return handleVoiceWebhook(request, "twilio");
}
