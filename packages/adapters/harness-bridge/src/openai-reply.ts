import type { Usage } from "@halonicjs/events";
import { isPlainObject } from "@halonicjs/std";
import { field, ProviderReplyReader, parseJson, tokenCount } from "./provider-reply.ts";
import type { ServerSentEvent } from "./server-sent-events.ts";

/**
 * The stream events that end a response and carry the whole response,
 * usage included. OpenAI charges for an incomplete or failed response too,
 * as far as it got.
 */
const finalEvents = new Set(["response.completed", "response.incomplete", "response.failed"]);

/**
 * Reads what a Responses API call used from its reply, as the bridge passes
 * it through: from `usage` in a JSON reply, or from the response that a
 * stream's `response.completed` event carries. OpenAI sends usage only at the
 * end, so a stream cut short before then tells nothing. It gathers the
 * answer's text too. Fields it doesn't know are skipped, and a reply other
 * than 200 uses nothing.
 * https://platform.openai.com/docs/api-reference/responses-streaming
 */
export class OpenAiReplyReader extends ProviderReplyReader {
  #usage: Usage | undefined;

  protected readEvent({ event, data }: ServerSentEvent): void {
    const parsed = parseJson(data);
    // Each event names its type in its data too; the `event` line is optional.
    const type =
      isPlainObject(parsed) && typeof parsed["type"] === "string" ? parsed["type"] : event;
    if (finalEvents.has(type)) {
      this.#readUsage(field(parsed, "response")?.["usage"]);
    } else if (type === "response.output_text.delta") {
      const delta = isPlainObject(parsed) ? parsed["delta"] : undefined;
      if (typeof delta === "string") this.addText(delta);
    }
  }

  /** Reads a whole response, as a reply that isn't streamed carries it. */
  protected readReply(response: unknown): void {
    if (!isPlainObject(response)) return;
    this.#readUsage(response["usage"]);
    const output = response["output"];
    if (!Array.isArray(output)) return;
    for (const item of output) {
      if (!isPlainObject(item) || item["type"] !== "message") continue;
      const content = item["content"];
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (
          isPlainObject(part) &&
          part["type"] === "output_text" &&
          typeof part["text"] === "string"
        ) {
          this.addText(part["text"]);
        }
      }
    }
  }

  protected usage(): Usage | undefined {
    return this.#usage;
  }

  /**
   * Takes a response's `usage`. Unlike Anthropic's, OpenAI's `input_tokens`
   * also counts the tokens read from the prompt cache, which
   * `input_tokens_details.cached_tokens` gives. Those are taken out of the
   * input and counted as cache reads, because spend prices them at their own
   * price, as for Anthropic (HAL-3229). `output_tokens` already counts the reasoning
   * tokens, so it is taken as it is.
   */
  #readUsage(usage: unknown): void {
    if (!isPlainObject(usage)) return;
    const input = tokenCount(usage["input_tokens"]);
    const output = tokenCount(usage["output_tokens"]);
    if (input === undefined && output === undefined) return;
    const cacheRead = Math.min(cachedTokens(usage), input ?? 0);
    this.#usage = {
      inputTokens: (input ?? 0) - cacheRead,
      outputTokens: output ?? 0,
      ...(cacheRead > 0 ? { cacheReadTokens: cacheRead } : {}),
    };
  }
}

/** The tokens a response's `usage` says were read from the prompt cache, or 0. */
function cachedTokens(usage: Record<string, unknown>): number {
  const details = usage["input_tokens_details"];
  if (!isPlainObject(details)) return 0;
  return tokenCount(details["cached_tokens"]) ?? 0;
}
