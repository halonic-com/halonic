import type { GroundingReason } from "./grounding.ts";

/**
 * The one log record each front bot decision leaves (HAL-18847 section 4.3,
 * Julian's condition): time, task, run, call type, tokens, cost, latency and
 * outcome, with a fixed reason code. No message text, prompt, reply, error
 * body or header ever goes in: the record has no field that could hold one.
 */

/** What happened to one message. */
export type FrontBotOutcome =
  | "posted"
  | "skip"
  | "rejected"
  | "capped"
  | "stopped"
  | "failed"
  | "not_called";

/** Why, as a fixed code: a grounding reason, an API failure's status or type, or a reason for not calling. */
export type FrontBotReason =
  | GroundingReason
  | "off"
  | "no_key"
  | "out_of_scope"
  | "secret_in_input"
  | "agent_answered"
  | "cap_reached"
  | "error_rate"
  | `http_${number}`
  | "timeout"
  | "network"
  | "unreadable_answer"
  | "post_failed";

/** The one record per decision. Every field is a number, a fixed code or an id. */
export interface FrontBotLogRecord {
  readonly at: string;
  readonly companyId: string;
  readonly taskId: string;
  /** The agent run the message woke, when one was queued; Paperclip ids only. */
  readonly runId: string | undefined;
  readonly callType: "first_reply";
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicroUsd: number;
  readonly latencyMs: number;
  readonly outcome: FrontBotOutcome;
  readonly reason: FrontBotReason | undefined;
}

/** The fields a record may have, in order; the must-fail tests compare every logged record against it. */
export const allowedLogFields = [
  "at",
  "companyId",
  "taskId",
  "runId",
  "callType",
  "inputTokens",
  "outputTokens",
  "costMicroUsd",
  "latencyMs",
  "outcome",
  "reason",
] as const;

/** A record for a message the bot made no call for. */
export function notCalledRecord(
  base: Pick<FrontBotLogRecord, "at" | "companyId" | "taskId" | "runId">,
  outcome: FrontBotOutcome,
  reason: FrontBotReason,
): FrontBotLogRecord {
  return {
    ...base,
    callType: "first_reply",
    inputTokens: 0,
    outputTokens: 0,
    costMicroUsd: 0,
    latencyMs: 0,
    outcome,
    reason,
  };
}

/** The record as the logger's metadata: only the allowed fields, in a plain object. */
export function logMeta(record: FrontBotLogRecord): Record<string, string | number> {
  const meta: Record<string, string | number> = {};
  for (const field of allowedLogFields) {
    const value = record[field];
    if (value !== undefined) {
      meta[field] = value;
    }
  }
  return meta;
}
