import type { ChatResponse, ToolCall } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import { replayType } from "./request.ts";

/** Thrown when a vendor's reply isn't a Messages API message. */
export class ReplyFormatError extends Error {
  override readonly name = "ReplyFormatError";
}

/** Thinking blocks are joined with a blank line, so separate thoughts stay apart. */
export const reasoningSeparator = "\n\n";

/**
 * The {@link ChatResponse} in a `/v1/messages` reply body: the text blocks
 * joined, the thinking blocks as the reasoning, the `tool_use` blocks as
 * tool calls, the usage and the stop reason.
 *
 * When the reply holds thinking, its content blocks go into `replay`, since
 * the API wants them back unchanged, signatures and all, in the next turn.
 *
 * @throws {ReplyFormatError} when the body has no list of content blocks
 */
export function readReply(body: unknown): ChatResponse {
  const content = isPlainObject(body) ? body["content"] : undefined;
  if (!isPlainObject(body) || !Array.isArray(content)) {
    throw new ReplyFormatError("the reply has no content blocks");
  }
  const blocks = content.filter(isPlainObject);
  const toolCalls = blocks.filter((block) => block["type"] === "tool_use").map(readToolCall);
  const reasoning = blocks
    .filter((block) => block["type"] === "thinking")
    .map((block) => textOf(block["thinking"]))
    .join(reasoningSeparator);
  return {
    content: blocks
      .filter((block) => block["type"] === "text")
      .map((block) => textOf(block["text"]))
      .join(""),
    ...(reasoning === "" ? {} : { reasoning }),
    toolCalls,
    usage: readUsage(body["usage"]),
    finishReason: readStopReason(body["stop_reason"], toolCalls.length > 0),
    ...(blocks.some(isThinking) ? { replay: { type: replayType, data: blocks } } : {}),
  };
}

function readToolCall(block: Record<string, unknown>): ToolCall {
  const input = block["input"];
  return {
    id: textOf(block["id"]),
    name: textOf(block["name"]),
    arguments: isPlainObject(input) ? input : {},
  };
}

/** Whether a block is thinking, shown or redacted, which the API needs back in the next turn. */
function isThinking(block: Record<string, unknown>): boolean {
  return block["type"] === "thinking" || block["type"] === "redacted_thinking";
}

/**
 * The usage in our terms. The API's `input_tokens` already leaves out the
 * tokens read from or written to the prompt cache, as our `inputTokens` does,
 * so each count maps straight across. The cache counts are left out when
 * there were none.
 */
export function readUsage(value: unknown): ChatResponse["usage"] {
  const usage = isPlainObject(value) ? value : {};
  const cacheReadTokens = countOf(usage["cache_read_input_tokens"]);
  const cacheWriteTokens = countOf(usage["cache_creation_input_tokens"]);
  return {
    inputTokens: countOf(usage["input_tokens"]),
    outputTokens: countOf(usage["output_tokens"]),
    ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens > 0 ? { cacheWriteTokens } : {}),
  };
}

/** The stop reason in our terms. An answer with tool calls always finishes with `tool_calls`. */
export function readStopReason(value: unknown, calledTools: boolean): ChatResponse["finishReason"] {
  if (calledTools) return "tool_calls";
  switch (value) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
    case "model_context_window_exceeded":
      return "length";
    case "tool_use":
      return "tool_calls";
    default:
      // `pause_turn`, `refusal` and whatever the API adds later.
      return "other";
  }
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function countOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}
