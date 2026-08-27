import { handleVoiceWebhook } from "@/lib/voice-webhook";

/** Needs Node's crypto for constant-time signature comparison. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Post-call analysis runs past the response via waitUntil. */
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
	return handleVoiceWebhook(request, "vapi");
}
