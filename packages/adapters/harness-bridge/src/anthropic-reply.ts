import type { Usage } from "@halonicjs/events";
import { isPlainObject } from "@halonicjs/std";
import { field, ProviderReplyReader, parseJson, tokenCount } from "./provider-reply.ts";
import type { ServerSentEvent } from "./server-sent-events.ts";

/** Anthropic's token counts, by their names in the reply. */
const countNames = [
  "input_tokens",
  "output_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
] as const;
type AnthropicCounts = Partial<Record<(typeof countNames)[number], number>>;

/**
 * Reads what a Messages API call used from its reply, as the bridge passes
 * it through: from `usage` in a JSON reply, or from the `message_start` and
 * `message_delta` events of a stream, where a later count replaces an
 * earlier one. It gathers the answer's text too. Fields it doesn't know are
 * skipped, and a reply other than 200 uses nothing.
 * https://docs.anthropic.com/en/docs/build-with-claude/streaming
 */
export class AnthropicReplyReader extends ProviderReplyReader {
  #counts: AnthropicCounts | undefined;

  protected readEvent({ event, data }: ServerSentEvent): void {
    const parsed = parseJson(data);
    if (event === "message_start") {
      this.#addCounts(field(parsed, "message")?.["usage"]);
    } else if (event === "message_delta") {
      this.#addCounts(field(parsed, "usage"));
    } else if (event === "content_block_delta") {
      const delta = field(parsed, "delta");
      if (delta?.["type"] === "text_delta" && typeof delta["text"] === "string") {
        this.addText(delta["text"]);
      }
    }
  }

  /** Reads a whole message, as a reply that isn't streamed carries it. */
  protected readReply(message: unknown): void {
    if (!isPlainObject(message)) return;
    this.#addCounts(message["usage"]);
    const content = message["content"];
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (isPlainObject(block) && block["type"] === "text" && typeof block["text"] === "string") {
        this.addText(block["text"]);
      }
    }
  }

  /**
   * Anthropic's counts as Halonic's usage. `input_tokens` leaves out the
   * tokens read from or written to the prompt cache, so they are added back,
   * as the Anthropic model adapter does: `Usage` has no field for the cache
   * split yet, so spend prices them all as plain input.
   */
  protected usage(): Usage | undefined {
    const counts = this.#counts;
    if (counts === undefined) return undefined;
    return {
      inputTokens:
        (counts.input_tokens ?? 0) +
        (counts.cache_creation_input_tokens ?? 0) +
        (counts.cache_read_input_tokens ?? 0),
      outputTokens: counts.output_tokens ?? 0,
    };
  }

  /** Takes the counts a `usage` object gives, each replacing the one before. */
  #addCounts(usage: unknown): void {
    if (!isPlainObject(usage)) return;
    for (const name of countNames) {
      const count = tokenCount(usage[name]);
      if (count !== undefined) this.#counts = { ...this.#counts, [name]: count };
    }
  }
}
