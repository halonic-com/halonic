import type { Usage } from "@halonicjs/events";
import { isPlainObject } from "@halonicjs/std";
import { type ServerSentEvent, ServerSentEventReader } from "./server-sent-events.ts";
import type { ReplyReader, ReplyReading } from "./spend.ts";

/**
 * The most of a reply that isn't streamed the reader keeps to find its usage
 * in. A reply is limited by its `max_tokens`, so a real one stays far below.
 */
const maxJsonReplyBytes = 32 * 1024 * 1024;

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
export class AnthropicReplyReader implements ReplyReader {
  /** How the body is read; `none` once there is nothing (more) to read in it. */
  #body: "stream" | "json" | "none" = "none";
  readonly #events = new ServerSentEventReader();
  readonly #json: Uint8Array[] = [];
  #jsonBytes = 0;
  #counts: AnthropicCounts | undefined;
  #text = "";

  started(status: number, headers: Headers): void {
    if (status !== 200) return;
    const type = headers.get("content-type") ?? "";
    if (type.startsWith("text/event-stream")) this.#body = "stream";
    else if (type.startsWith("application/json")) this.#body = "json";
  }

  received(chunk: Uint8Array): void {
    if (this.#body === "stream") {
      for (const event of this.#events.read(chunk)) this.#readEvent(event);
    } else if (this.#body === "json") {
      this.#jsonBytes += chunk.length;
      this.#json.push(chunk);
      // Too large to keep: its usage stays unknown, and the call isn't recorded as spent.
      if (this.#jsonBytes > maxJsonReplyBytes) this.#forgetJson();
    }
  }

  reading(): ReplyReading | undefined {
    if (this.#body === "json") {
      this.#readMessage(parseJson(new TextDecoder().decode(Buffer.concat(this.#json))));
      this.#forgetJson();
    }
    return this.#counts === undefined
      ? undefined
      : { usage: toUsage(this.#counts), text: this.#text };
  }

  #readEvent({ event, data }: ServerSentEvent): void {
    const parsed = parseJson(data);
    if (event === "message_start") {
      this.#addCounts(field(parsed, "message")?.["usage"]);
    } else if (event === "message_delta") {
      this.#addCounts(field(parsed, "usage"));
    } else if (event === "content_block_delta") {
      const delta = field(parsed, "delta");
      if (delta?.["type"] === "text_delta" && typeof delta["text"] === "string") {
        this.#text += delta["text"];
      }
    }
  }

  /** Reads a whole message, as a reply that isn't streamed carries it. */
  #readMessage(message: unknown): void {
    if (!isPlainObject(message)) return;
    this.#addCounts(message["usage"]);
    const content = message["content"];
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (isPlainObject(block) && block["type"] === "text" && typeof block["text"] === "string") {
        this.#text += block["text"];
      }
    }
  }

  /** Takes the counts a `usage` object gives, each replacing the one before. */
  #addCounts(usage: unknown): void {
    if (!isPlainObject(usage)) return;
    for (const name of countNames) {
      const count = usage[name];
      if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) {
        this.#counts = { ...this.#counts, [name]: count };
      }
    }
  }

  #forgetJson(): void {
    this.#body = "none";
    this.#json.length = 0;
  }
}

/**
 * Anthropic's counts as Halonic's usage. `input_tokens` leaves out the
 * tokens read from or written to the prompt cache, so they are added back,
 * as the Anthropic model adapter does: `Usage` has no field for the cache
 * split yet, so spend prices them all as plain input.
 */
function toUsage(counts: AnthropicCounts): Usage {
  return {
    inputTokens:
      (counts.input_tokens ?? 0) +
      (counts.cache_creation_input_tokens ?? 0) +
      (counts.cache_read_input_tokens ?? 0),
    outputTokens: counts.output_tokens ?? 0,
  };
}

/** The object at `name` of `value`, when `value` is an object and that field is one too. */
function field(value: unknown, name: string): Record<string, unknown> | undefined {
  if (!isPlainObject(value)) return undefined;
  const inner = value[name];
  return isPlainObject(inner) ? inner : undefined;
}

/** The JSON in `text`, or `undefined` when it isn't JSON, such as a reply cut short. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
