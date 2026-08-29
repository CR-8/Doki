import { audioPublisher } from "@doki/api/lib/audio-publisher";
import { resolveVoiceByAccountSid } from "@doki/api/lib/telephony";
import {
	buildAnalysisSystemPrompt,
	buildAnalysisUserPrompt,
	callAnalysisSchema,
	getLlmProvider,
} from "@doki/connectors/llm/index";
import {
	getVoiceProvider,
	type VoiceProvider,
} from "@doki/connectors/voice/index";
import { db } from "@doki/db";
import { analyzeCall, ingestVoiceEvent } from "@doki/domain";
import { waitUntil } from "@vercel/functions";

/**
 * Kicks off post-call analysis without holding the webhook open.
 *
 * Providers time out and retry if a handler is slow, and analysis takes a few
 * seconds. Deliberately fire-and-forget for now — when the queue lands this
 * becomes an enqueue, which also survives a process restart. Until then, a
 * missed analysis is recoverable via the Run analysis button.
 */
function scheduleAnalysis(organizationId: string, callId: string): void {
	let llm: ReturnType<typeof getLlmProvider>;
	try {
		llm = getLlmProvider();
	} catch {
		// No LLM configured — analysis is optional, the call record is not.
		return;
	}

	const task = analyzeCall(
		db,
		llm,
		{ callAnalysisSchema, buildAnalysisSystemPrompt, buildAnalysisUserPrompt },
		{ organizationId, callId },
	)
		.then((result) => {
			if (!result.ok) {
				console.warn("[webhook] analysis skipped", {
					callId,
					reason: result.reason,
				});
			}
		})
		.catch((error) => {
			console.error("[webhook] analysis failed", { callId, error });
		});

	// On serverless the instance is frozen the moment the response is returned,
	// which would kill this mid-flight. waitUntil keeps it alive past the
	// response without making the provider wait for it. Outside that runtime
	// the helper is unavailable, and a plain floating promise is correct.
	try {
		waitUntil(task);
	} catch {
		void task;
	}
}

/**
 * Shared voice-webhook ingress for every provider.
 *
 * Order is deliberate: read the RAW body, verify the signature against those
 * exact bytes and the request URL, and only then let the provider decode it.
 * Verifying a re-serialised payload would compare different bytes than the
 * ones that were signed.
 *
 * Always acknowledges once the signature checks out — a provider retrying
 * because our database hiccuped only makes things worse, and every handler
 * downstream is idempotent anyway.
 */
export async function handleVoiceWebhook(
	request: Request,
	expectedProvider: string,
): Promise<Response> {
	const rawBody = await request.text();

	const headers: Record<string, string> = {};
	request.headers.forEach((value, key) => {
		headers[key.toLowerCase()] = value;
	});

	// Attribute the callback to a workspace before verifying it.
	//
	// Workspaces dial from their own Twilio accounts, so the token this
	// signature must be checked against depends on which account sent it. The
	// claimed SID is used only to *select* a key — a forged one simply fails
	// the signature check below.
	let voice: VoiceProvider | null = null;
	if (expectedProvider === "twilio") {
		const accountSid = new URLSearchParams(rawBody).get("AccountSid");
		if (accountSid) {
			voice = await resolveVoiceByAccountSid(db, accountSid, {
				audio: audioPublisher,
			}).catch(() => null);
		}
	}

	if (!voice) {
		try {
			voice = getVoiceProvider({ audio: audioPublisher });
		} catch (error) {
			console.error("[webhook] provider not configured", error);
			return Response.json(
				{ error: "Voice provider not configured" },
				{ status: 500 },
			);
		}
	}

	// Guard against a stale endpoint still receiving traffic after a switch.
	if (voice.name !== expectedProvider) {
		console.warn("[webhook] provider mismatch", {
			endpoint: expectedProvider,
			configured: voice.name,
		});
		return Response.json({ error: "Provider not active" }, { status: 409 });
	}

	const webhookRequest = { rawBody, headers, url: request.url };

	if (!voice.verifyWebhook(webhookRequest)) {
		// Do not leak whether the secret is missing or merely wrong.
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const event = voice.parseWebhook(webhookRequest);
	if (!event) {
		// Unrecognised event types are acknowledged, not retried.
		return Response.json({ ok: true, ignored: true });
	}

	try {
		const result = await ingestVoiceEvent(db, event);
		if (!result.handled) {
			console.warn("[webhook] unhandled event", result.reason);
			return Response.json({ ok: true, ignored: true });
		}

		// Analyse once, on the first delivery that ends the call.
		if (result.ended && !result.duplicate) {
			scheduleAnalysis(result.organizationId, result.callId);
		}

		return Response.json({
			ok: true,
			callId: result.callId,
			duplicate: result.duplicate,
		});
	} catch (error) {
		console.error("[webhook] ingest failed", error);
		return Response.json({ error: "Ingest failed" }, { status: 500 });
	}
}
