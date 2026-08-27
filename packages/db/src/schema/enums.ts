import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Technical state of a phone call. Owned by the telephony provider webhook.
 * NEVER conflate this with sales outcome — see `salesOutcomeEnum`.
 */
export const callStatusEnum = pgEnum("call_status", [
	"QUEUED",
	"DIALING",
	"RINGING",
	"IN_PROGRESS",
	"COMPLETED",
	"FAILED",
	"BUSY",
	"NO_ANSWER",
	"VOICEMAIL",
	"CANCELED",
]);

/**
 * Business result of a call. Proposed by AI, confirmed by deterministic code.
 */
export const salesOutcomeEnum = pgEnum("sales_outcome", [
	"UNKNOWN",
	"INTERESTED",
	"NOT_INTERESTED",
	"CALLBACK_REQUESTED",
	"QUALIFIED",
	"MEETING_BOOKED",
	"WRONG_NUMBER",
	"DO_NOT_CALL",
]);

export const callDirectionEnum = pgEnum("call_direction", [
	"OUTBOUND",
	"INBOUND",
]);

/** Lead lifecycle. Deterministic application state — the source of truth. */
export const leadStatusEnum = pgEnum("lead_status", [
	"NEW",
	"ATTEMPTING_CONTACT",
	"CONTACTED",
	"QUALIFIED",
	"MEETING_BOOKED",
	"NOT_INTERESTED",
	"UNREACHABLE",
	"SUPPRESSED",
]);

/**
 * How consent to call this lead was obtained. Required under TCCCPR —
 * a boolean is not enough, you must be able to prove provenance.
 */
export const consentSourceEnum = pgEnum("consent_source", [
	"WEB_FORM",
	"INBOUND_ENQUIRY",
	"EXISTING_CUSTOMER",
	"IMPORT_ATTESTED",
	"MANUAL_ENTRY",
]);

export const consentStatusEnum = pgEnum("consent_status", [
	"UNKNOWN",
	"GRANTED",
	"REVOKED",
	"EXPIRED",
]);

/** Why a number is blocked from being called. */
export const suppressionReasonEnum = pgEnum("suppression_reason", [
	"USER_OPT_OUT",
	"DND_REGISTRY",
	"WRONG_NUMBER",
	"COMPLAINT",
	"MANUAL",
	"BOUNCED",
]);

/** Regulatory series the call must be placed on (TRAI TCCCPR). */
export const callPurposeEnum = pgEnum("call_purpose", [
	"PROMOTIONAL",
	"TRANSACTIONAL",
	"SERVICE",
]);

export const agentStatusEnum = pgEnum("agent_status", [
	"DRAFT",
	"ACTIVE",
	"PAUSED",
	"ARCHIVED",
]);

/** Metered resource types, for unit economics and client billing. */
export const usageKindEnum = pgEnum("usage_kind", [
	"CALL_SECONDS",
	"STT_SECONDS",
	"TTS_CHARACTERS",
	"LLM_INPUT_TOKENS",
	"LLM_OUTPUT_TOKENS",
	"TELEPHONY_SECONDS",
]);
