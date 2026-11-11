import type { ChatResponse, ToolCall } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";

/** Thrown when a vendor's reply isn't in OpenAI's chat completions format. */
export class ReplyFormatError extends Error {
  override readonly name = "ReplyFormatError";
}

/**
 * The {@link ChatResponse} in a `/v1/chat/completions` reply body: the first
 * choice's text, reasoning and tool calls, the usage and the finish reason.
 *
 * Local servers send the reasoning of thinking models as `reasoning_content`
 * (LM Studio, llama.cpp) or `reasoning` (Ollama); OpenAI's own models send none.
 *
 * @throws {ReplyFormatError} when the body has no choice with a message
 */
export function readReply(body: unknown): ChatResponse {
  const choice = firstChoice(body);
  const message = choice["message"];
  if (!isPlainObject(message)) throw new ReplyFormatError("the reply's choice has no message");
  const toolCalls = readToolCalls(message["tool_calls"]);
  const reasoning = textOf(message["reasoning_content"]) || textOf(message["reasoning"]);
  return {
    content: textOf(message["content"]),
    ...(reasoning === "" ? {} : { reasoning }),
    toolCalls,
    usage: readUsage(isPlainObject(body) ? body["usage"] : undefined),
    finishReason: readFinishReason(choice["finish_reason"], toolCalls.length > 0),
  };
}

function firstChoice(body: unknown): Record<string, unknown> {
  const choices = isPlainObject(body) ? body["choices"] : undefined;
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
  if (!isPlainObject(first)) throw new ReplyFormatError("the reply has no choices");
  return first;
}

function readToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainObject).map((call, index) => {
    const fn = isPlainObject(call["function"]) ? call["function"] : {};
    const signature = readThoughtSignature(call);
    return {
      // Some local servers leave the id out; each call still needs its own.
      id: textOf(call["id"]) || `call_${index}`,
      name: textOf(fn["name"]),
      arguments: readArguments(fn["arguments"]),
      ...(signature === "" ? {} : { signature }),
    };
  });
}

/**
 * Gemini's thought signature on a tool call, or "" when it has none. Gemini's
 * OpenAI-compatible API puts it in `extra_content.google.thought_signature`,
 * on a whole call and on a streamed piece alike, and Gemini 3 refuses the
 * next call when it doesn't come back with the call. Only the first of
 * parallel calls has one.
 */
export function readThoughtSignature(call: Record<string, unknown>): string {
  const extra = call["extra_content"];
  const google = isPlainObject(extra) ? extra["google"] : undefined;
  return isPlainObject(google) ? textOf(google["thought_signature"]) : "";
}

/** A tool call's arguments, sent as JSON text or, by some local servers, as an object. */
function readArguments(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : parseArguments(textOf(value));
}

/**
 * A tool call's arguments as an object. Models write them as JSON text; when
 * that isn't a JSON object (small local models get it wrong), the text goes
 * on as `input`, as the mock model does, so the tool's argument check can
 * tell the model what was wrong.
 */
export function parseArguments(text: string): Record<string, unknown> {
  if (text.trim() === "") return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (isPlainObject(parsed)) return parsed;
  } catch {
    // Not JSON: passed on as input below.
  }
  return { input: text };
}

/**
 * The token counts in a reply's `usage`; a missing count is 0. Unlike
 * Anthropic's, `prompt_tokens` also counts the tokens read from the prompt
 * cache, which `prompt_tokens_details.cached_tokens` gives. Those are taken
 * out of the input and counted as cache reads, because spend prices them at
 * their own price, as the harness bridge does.
 */
export function readUsage(value: unknown): ChatResponse["usage"] {
  const usage = isPlainObject(value) ? value : {};
  const prompt = countOf(usage["prompt_tokens"]);
  const details = usage["prompt_tokens_details"];
  const cached = isPlainObject(details) ? countOf(details["cached_tokens"]) : 0;
  const cacheReadTokens = Math.min(cached, prompt);
  return {
    inputTokens: prompt - cacheReadTokens,
    outputTokens: countOf(usage["completion_tokens"]),
    ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
  };
}

/**
 * The finish reason in our terms. Ollama says `stop` even when the model
 * called tools, so `stop` with tool calls finishes with `tool_calls`. `length`
 * stays `length`, because the last call's arguments may have been cut off.
 */
export function readFinishReason(
  value: unknown,
  calledTools: boolean,
): ChatResponse["finishReason"] {
  switch (value) {
    case "stop":
      return calledTools ? "tool_calls" : "stop";
    case "length":
      return "length";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    default:
      return "other";
  }
}

/** `value` when it is a string, otherwise "". */
export function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function countOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}
