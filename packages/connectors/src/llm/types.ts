import type { z } from "zod";

export type LlmRole = "system" | "user" | "assistant";

export type LlmMessage = {
	role: LlmRole;
	content: string;
};

export type LlmUsage = {
	inputTokens: number;
	outputTokens: number;
};

export type StructuredRequest<TSchema extends z.ZodType> = {
	/** Stable, cacheable system policy. Keep it small. */
	system: string;
	messages: LlmMessage[];
	/** Output contract. The provider MUST return something matching this. */
	schema: TSchema;
	/** Name for the schema, required by strict JSON-schema modes. */
	schemaName: string;
	model?: string;
	temperature?: number;
	maxOutputTokens?: number;
};

export type StructuredResult<TSchema extends z.ZodType> = {
	data: z.infer<TSchema>;
	usage: LlmUsage;
	model: string;
	/** Kept for audit — what the model actually emitted before validation. */
	raw: unknown;
};

/**
 * Business logic depends on this, never on a vendor SDK.
 *
 * `generateStructured` is the only entry point that matters: every AI output
 * in this system is schema-validated before it is allowed to touch state.
 * There is deliberately no "give me free text and I'll parse it" method.
 */
export interface LlmProvider {
	readonly name: string;
	generateStructured<TSchema extends z.ZodType>(
		req: StructuredRequest<TSchema>,
	): Promise<StructuredResult<TSchema>>;
}

export class LlmValidationError extends Error {
	constructor(
		message: string,
		readonly raw: unknown,
		readonly issues?: unknown,
	) {
		super(message);
		this.name = "LlmValidationError";
	}
}

export class LlmProviderError extends Error {
	constructor(
		message: string,
		readonly status?: number,
		readonly retryable = false,
	) {
		super(message);
		this.name = "LlmProviderError";
	}
}
