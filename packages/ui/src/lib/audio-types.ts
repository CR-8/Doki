/**
 * Character-level timing for synthesised or transcribed speech.
 *
 * Structurally identical to ElevenLabs' `CharacterAlignmentResponseModel`,
 * declared locally so the UI package does not depend on the ElevenLabs SDK
 * just to borrow one interface. Our own STT provider (Sarvam/Deepgram) can
 * emit this same shape.
 */
export type CharacterAlignmentResponseModel = {
	characters: string[];
	characterStartTimesSeconds: number[];
	characterEndTimesSeconds: number[];
};
