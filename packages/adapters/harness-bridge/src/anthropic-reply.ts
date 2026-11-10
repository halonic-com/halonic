import type { Usage } from "@halonicjs/events";
import { isPlainObject } from "@halonicjs/std";
import { field, ProviderReplyReader, parseJson, tokenCount } from "./provider-reply.ts";
import type { ServerSentEvent } from "./server-sent-events.ts";

/** Anthropic's token counts in `usage`, by their names in the reply. */
const countNames = [
  "input_tokens",
  "output_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
] as const;
/**
 * The cache writes split by how long the cache entry lives, in
 * `usage.cache_creation`. Absent on older models.
 */
const cacheWriteNames = ["ephemeral_5m_input_tokens", "ephemeral_1h_input_tokens"] as const;
type AnthropicCounts = Partial<
  Record<(typeof countNames)[number] | (typeof cacheWriteNames)[number], number>
>;

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

  protected usage(): Usage | undefined {
    return this.#counts === undefined ? undefined : toUsage(this.#counts);
  }

  /**
   * Takes the counts a `usage` object gives, and its split of the cache
   * writes, each replacing the one before.
   */
  #addCounts(usage: unknown): void {
    if (!isPlainObject(usage)) return;
    this.#takeCounts(usage, countNames);
    const cacheCreation = usage["cache_creation"];
    if (isPlainObject(cacheCreation)) this.#takeCounts(cacheCreation, cacheWriteNames);
  }

  #takeCounts(from: Record<string, unknown>, names: readonly (keyof AnthropicCounts)[]): void {
    for (const name of names) {
      const count = tokenCount(from[name]);
      if (count !== undefined) this.#counts = { ...this.#counts, [name]: count };
    }
  }
}

/**
 * Anthropic's counts as Halonic's usage, as the Anthropic model adapter
 * reads them. `input_tokens` already leaves out the tokens read from or
 * written to the prompt cache, which is what `inputTokens` means too. The
 * cache tokens go in their own counts, because spend prices each at its own
 * price (decisions HAL-2688-01 and -02). A count that is 0 is left out.
 */
function toUsage(counts: AnthropicCounts): Usage {
  const writes = cacheWrites(counts);
  return {
    inputTokens: counts.input_tokens ?? 0,
    outputTokens: counts.output_tokens ?? 0,
    ...countIfAny("cacheReadTokens", counts.cache_read_input_tokens ?? 0),
    ...countIfAny("cacheWriteTokens", writes.short),
    ...countIfAny("cacheWrite1hTokens", writes.oneHour),
  };
}

/**
 * Splits the cache writes into 5-minute and 1-hour writes, which cost
 * different prices. Without the `cache_creation` split, every write counts
 * as a 5-minute write: that is the default lifetime, and the cheaper price
 * when the model has a 1-hour price too.
 */
function cacheWrites(counts: AnthropicCounts): { short: number; oneHour: number } {
  const short = counts.ephemeral_5m_input_tokens;
  const oneHour = counts.ephemeral_1h_input_tokens;
  if (short === undefined && oneHour === undefined) {
    return { short: counts.cache_creation_input_tokens ?? 0, oneHour: 0 };
  }
  return { short: short ?? 0, oneHour: oneHour ?? 0 };
}

function countIfAny<Name extends keyof Usage>(name: Name, count: number): Partial<Usage> {
  return count > 0 ? { [name]: count } : {};
}
