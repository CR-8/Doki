import { handleVoiceWebhook } from "@/lib/voice-webhook";

/** Needs Node's crypto for constant-time signature comparison. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
	return handleVoiceWebhook(request, "vapi");
}
