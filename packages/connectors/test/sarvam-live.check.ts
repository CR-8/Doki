import dotenv from "dotenv";

dotenv.config({ path: "../../apps/web/.env" });

const { SarvamTtsProvider } = await import("../src/tts/sarvam");

/**
 * Live smoke test against the real Sarvam API.
 *
 * Exists because the request shape was taken from documentation, and the two
 * doc pages disagreed on the language field name. Costs a few paise and takes
 * a second — far cheaper than discovering a 400 mid-demo.
 */
const apiKey = process.env.SARVAM_API_KEY;
if (!apiKey) {
	console.error("SARVAM_API_KEY is not set in apps/web/.env");
	process.exit(1);
}

const model = process.env.SARVAM_TTS_MODEL ?? "bulbul:v2";
const speaker = process.env.SARVAM_TTS_SPEAKER ?? "anushka";

const provider = new SarvamTtsProvider({ apiKey, model, speaker });

const text = "Namaste, main Acme Sales ki AI assistant bol rahi hoon.";
console.log(`model=${model} speaker=${speaker}`);
console.log(`text: ${text}`);

try {
	const started = Date.now();
	const result = await provider.synthesize({ text, language: "hi-en" });
	const ms = Date.now() - started;

	console.log("\nOK");
	console.log(`  latency:    ${ms} ms`);
	console.log(`  mime:       ${result.mimeType}`);
	console.log(`  bytes:      ${result.audio.byteLength}`);
	console.log(`  characters: ${result.characters}`);
	console.log(`  speaker:    ${result.speaker}`);

	// An MP3 frame starts with an ID3 tag or a frame sync (0xFF 0xEx/0xFx).
	const head = result.audio.subarray(0, 3);
	const isId3 = head.toString("ascii") === "ID3";
	const isFrameSync = head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0;
	console.log(`  looks like mp3: ${isId3 || isFrameSync}`);

	if (result.audio.byteLength < 1000) {
		console.error("\nSuspiciously small audio — check the response.");
		process.exit(1);
	}
	process.exit(0);
} catch (error) {
	console.error("\nFAILED");
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
