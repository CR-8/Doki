/**
 * Voices available for synthesis.
 *
 * Kept beside the provider rather than in the console, because the roster is a
 * property of the model: Sarvam retired every `bulbul:v2` speaker when v3
 * landed, and a list hard-coded in a form would have gone stale silently. The
 * `models` field records which model each voice belongs to, so a stored choice
 * can be checked rather than assumed.
 */
export type Voice = {
	/** Value stored on the agent and sent to the provider. */
	id: string;
	label: string;
	gender: "female" | "male";
	models: string[];
};

/** Confirmed against the live API — every id here synthesises on bulbul:v3. */
export const SARVAM_V3_VOICES: Voice[] = [
	{ id: "priya", label: "Priya", gender: "female", models: ["bulbul:v3"] },
	{ id: "neha", label: "Neha", gender: "female", models: ["bulbul:v3"] },
	{ id: "ritu", label: "Ritu", gender: "female", models: ["bulbul:v3"] },
	{ id: "pooja", label: "Pooja", gender: "female", models: ["bulbul:v3"] },
	{ id: "simran", label: "Simran", gender: "female", models: ["bulbul:v3"] },
	{ id: "kavya", label: "Kavya", gender: "female", models: ["bulbul:v3"] },
	{ id: "ishita", label: "Ishita", gender: "female", models: ["bulbul:v3"] },
	{ id: "shreya", label: "Shreya", gender: "female", models: ["bulbul:v3"] },
	{ id: "roopa", label: "Roopa", gender: "female", models: ["bulbul:v3"] },
	{ id: "tanya", label: "Tanya", gender: "female", models: ["bulbul:v3"] },
	{ id: "shruti", label: "Shruti", gender: "female", models: ["bulbul:v3"] },
	{ id: "suhani", label: "Suhani", gender: "female", models: ["bulbul:v3"] },
	{ id: "kavitha", label: "Kavitha", gender: "female", models: ["bulbul:v3"] },
	{ id: "rupali", label: "Rupali", gender: "female", models: ["bulbul:v3"] },
	{
		id: "niharika",
		label: "Niharika",
		gender: "female",
		models: ["bulbul:v3"],
	},
	{ id: "aditya", label: "Aditya", gender: "male", models: ["bulbul:v3"] },
	{ id: "ashutosh", label: "Ashutosh", gender: "male", models: ["bulbul:v3"] },
	{ id: "rahul", label: "Rahul", gender: "male", models: ["bulbul:v3"] },
	{ id: "rohan", label: "Rohan", gender: "male", models: ["bulbul:v3"] },
	{ id: "amit", label: "Amit", gender: "male", models: ["bulbul:v3"] },
	{ id: "dev", label: "Dev", gender: "male", models: ["bulbul:v3"] },
	{ id: "ratan", label: "Ratan", gender: "male", models: ["bulbul:v3"] },
	{ id: "varun", label: "Varun", gender: "male", models: ["bulbul:v3"] },
	{ id: "manan", label: "Manan", gender: "male", models: ["bulbul:v3"] },
	{ id: "sumit", label: "Sumit", gender: "male", models: ["bulbul:v3"] },
	{ id: "kabir", label: "Kabir", gender: "male", models: ["bulbul:v3"] },
	{ id: "aayan", label: "Aayan", gender: "male", models: ["bulbul:v3"] },
	{ id: "shubh", label: "Shubh", gender: "male", models: ["bulbul:v3"] },
	{ id: "advait", label: "Advait", gender: "male", models: ["bulbul:v3"] },
	{ id: "anand", label: "Anand", gender: "male", models: ["bulbul:v3"] },
	{ id: "tarun", label: "Tarun", gender: "male", models: ["bulbul:v3"] },
	{ id: "sunny", label: "Sunny", gender: "male", models: ["bulbul:v3"] },
	{ id: "mani", label: "Mani", gender: "male", models: ["bulbul:v3"] },
	{ id: "gokul", label: "Gokul", gender: "male", models: ["bulbul:v3"] },
	{ id: "vijay", label: "Vijay", gender: "male", models: ["bulbul:v3"] },
	{ id: "mohit", label: "Mohit", gender: "male", models: ["bulbul:v3"] },
	{ id: "rehan", label: "Rehan", gender: "male", models: ["bulbul:v3"] },
	{ id: "soham", label: "Soham", gender: "male", models: ["bulbul:v3"] },
];

/** Voices usable with a given model. */
export function voicesForModel(model: string): Voice[] {
	return SARVAM_V3_VOICES.filter((voice) => voice.models.includes(model));
}

/** Whether a stored voice id is still valid for the configured model. */
export function isVoiceValid(voiceId: string, model: string): boolean {
	return voicesForModel(model).some((voice) => voice.id === voiceId);
}
