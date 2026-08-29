import dotenv from "dotenv";

dotenv.config({ path: "../../apps/web/.env" });

const { isVoiceValid, voicesForModel } = await import(
	"@doki/connectors/tts/index"
);
const { db, pgClient } = await import("@doki/db");
const { agent } = await import("@doki/db/schema");
const { env } = await import("@doki/env/server");

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
	console.log(
		`${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
	);
	if (!ok) failures++;
}

const model = env.SARVAM_TTS_MODEL;
const roster = voicesForModel(model);

console.log(`model: ${model}   default voice: ${env.SARVAM_TTS_SPEAKER}`);
check("model is not the deprecated v2", model !== "bulbul:v2", model);
check("roster is populated", roster.length > 0, `${roster.length} voices`);
check(
	"the default voice is valid for the model",
	isVoiceValid(env.SARVAM_TTS_SPEAKER, model),
	env.SARVAM_TTS_SPEAKER,
);
check(
	"retired v2 voices are rejected",
	!isVoiceValid("anushka", model) && !isVoiceValid("manisha", model),
);

// Any agent still carrying a v2 voice would fail at dial time, silently until
// the call is placed. Worth surfacing here rather than there.
const agents = await db
	.select({ id: agent.id, name: agent.name, voiceId: agent.voiceId })
	.from(agent);

const stale = agents.filter(
	(a) => a.voiceId && !isVoiceValid(a.voiceId, model),
);

console.log(`\nagents: ${agents.length}`);
for (const a of agents) {
	console.log(`   ${a.name} -> ${a.voiceId ?? "(workspace default)"}`);
}
check(
	"no agent carries a voice the model rejects",
	stale.length === 0,
	stale.map((a) => `${a.name}=${a.voiceId}`).join(", "),
);

await pgClient.end();
console.log(
	failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
