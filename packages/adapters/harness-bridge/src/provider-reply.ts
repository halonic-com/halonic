import type { Usage } from "@halonicjs/events";
import { isPlainObject } from "@halonicjs/std";
import { type ServerSentEvent, ServerSentEventReader } from "./server-sent-events.ts";
import type { ReplyReader, ReplyReading } from "./spend.ts";

/**
 * The most of a reply that isn't streamed the reader keeps to find its usage
 * in. A reply is limited by its output token limit, so a real one stays far
 * below.
 */
const maxJsonReplyBytes = 32 * 1024 * 1024;

/**
 * What every provider's reply reader shares: it reads a 200 reply as it
 * passes through, as server-sent events when it streams and as one JSON
 * value when it doesn't, and keeps the answer's text. A reply other than
 * 200 uses nothing. Each provider says where its usage and text are.
 */
export abstract class ProviderReplyReader implements ReplyReader {
  /** How the body is read; `none` once there is nothing (more) to read in it. */
  #body: "stream" | "json" | "none" = "none";
  readonly #events = new ServerSentEventReader();
  readonly #json: Uint8Array[] = [];
  #jsonBytes = 0;
  #text = "";

  started(status: number, headers: Headers): void {
    if (status !== 200) return;
    const type = headers.get("content-type") ?? "";
    if (type.startsWith("text/event-stream")) this.#body = "stream";
    else if (type.startsWith("application/json")) this.#body = "json";
  }

  received(chunk: Uint8Array): void {
    if (this.#body === "stream") {
      for (const event of this.#events.read(chunk)) this.readEvent(event);
    } else if (this.#body === "json") {
      this.#jsonBytes += chunk.length;
      this.#json.push(chunk);
      // Too large to keep: its usage stays unknown, and the call isn't recorded as spent.
      if (this.#jsonBytes > maxJsonReplyBytes) this.#forgetJson();
    }
  }

  reading(): ReplyReading | undefined {
    if (this.#body === "json") {
      this.readReply(parseJson(new TextDecoder().decode(Buffer.concat(this.#json))));
      this.#forgetJson();
    }
    const usage = this.usage();
    return usage === undefined ? undefined : { usage, text: this.#text };
  }

  /** Takes in one event of a streamed reply. */
  protected abstract readEvent(event: ServerSentEvent): void;

  /** Takes in a whole reply that isn't streamed; `undefined` when it isn't JSON. */
  protected abstract readReply(reply: unknown): void;

  /** What the reply has said the call used so far, or `undefined` when it said nothing. */
  protected abstract usage(): Usage | undefined;

  /** Adds to the answer's text. */
  protected addText(text: string): void {
    this.#text += text;
  }

  #forgetJson(): void {
    this.#body = "none";
    this.#json.length = 0;
  }
}

/** The object at `name` of `value`, when `value` is an object and that field is one too. */
export function field(value: unknown, name: string): Record<string, unknown> | undefined {
  if (!isPlainObject(value)) return undefined;
  const inner = value[name];
  return isPlainObject(inner) ? inner : undefined;
}

/** `value` when it is a token count: a whole number, 0 or more. */
export function tokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** The JSON in `text`, or `undefined` when it isn't JSON, such as a reply cut short. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
