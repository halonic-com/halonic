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
   * already counts the tokens read from the prompt cache, and `output_tokens`
   * the reasoning tokens, so both are taken as they are.
   */
  #readUsage(usage: unknown): void {
    if (!isPlainObject(usage)) return;
    const input = tokenCount(usage["input_tokens"]);
    const output = tokenCount(usage["output_tokens"]);
    if (input === undefined && output === undefined) return;
    this.#usage = { inputTokens: input ?? 0, outputTokens: output ?? 0 };
  }
}
