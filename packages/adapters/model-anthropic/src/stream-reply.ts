import type { ChatResponse, ChatStreamEvent } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import { ReplyFormatError, readReply, reasoningSeparator } from "./reply.ts";

/** An `error` event in the stream, such as `overloaded_error` after the call was accepted. */
export class StreamedVendorError extends Error {
  override readonly name = "StreamedVendorError";
  /** The API's own error type, such as `overloaded_error`; empty when it gave none. */
  readonly vendorType: string;
  /** The API's own error text; empty when it gave none. */
  readonly vendorText: string;

  constructor(vendorType: string, vendorText: string) {
    super(vendorText || "error event");
    this.vendorType = vendorType;
    this.vendorText = vendorText;
  }
}

/**
 * Reads a streamed `/v1/messages` reply, event by event. It passes text,
 * thinking and tool input on as {@link ChatStreamEvent} pieces, and builds
 * the same message the API would have sent without streaming, so
 * {@link MessageStreamReader.finish} gives what `chat()` gives.
 *
 * A tool call's index in our pieces counts only the `tool_use` blocks, as
 * the response's `toolCalls` do.
 */
export class MessageStreamReader {
  #message: Record<string, unknown> = {};
  readonly #blocks: Array<Record<string, unknown>> = [];
  /** The tool input JSON so far, by block index. */
  readonly #inputJson = new Map<number, string>();
  /** Our tool call index, by block index. */
  readonly #toolIndex = new Map<number, number>();
  #thinkingBlocks = 0;
  #stopped = false;

  /**
   * The pieces one server-sent event adds, given its `data` text. The
   * event's name isn't needed: the data names its own type.
   *
   * @throws {StreamedVendorError} on an `error` event
   * @throws {ReplyFormatError} on an event that isn't JSON, or a tool input that isn't a JSON object
   */
  read(eventData: string): ChatStreamEvent[] {
    const data = parseData(eventData);
    switch (data["type"]) {
      case "message_start":
        this.#message = isPlainObject(data["message"]) ? { ...data["message"] } : {};
        return [];
      case "content_block_start":
        return this.#startBlock(indexOf(data), recordOf(data["content_block"]));
      case "content_block_delta":
        return this.#addDelta(indexOf(data), recordOf(data["delta"]));
      case "content_block_stop":
        this.#stopBlock(indexOf(data));
        return [];
      case "message_delta":
        this.#addMessageDelta(data);
        return [];
      case "message_stop":
        this.#stopped = true;
        return [];
      case "error": {
        const error = recordOf(data["error"]);
        throw new StreamedVendorError(textOf(error["type"]), textOf(error["message"]));
      }
      default:
        // `ping`, and event types the API adds later.
        return [];
    }
  }

  /**
   * The full answer, once the stream has ended with `message_stop`.
   *
   * @throws {ReplyFormatError} when the stream ended before `message_stop`
   */
  finish(): ChatResponse {
    if (!this.#stopped) throw new ReplyFormatError("the stream ended before message_stop");
    return readReply({ ...this.#message, content: this.#blocks });
  }

  /**
   * The API starts blocks in order, 0, 1, 2 and on. Any other index is
   * refused: a far one would grow the block list to that length.
   */
  #startBlock(index: number, block: Record<string, unknown>): ChatStreamEvent[] {
    if (index !== this.#blocks.length) {
      throw new ReplyFormatError(
        `block ${index} started, but block ${this.#blocks.length} was next`,
      );
    }
    this.#blocks.push({ ...block });
    switch (block["type"]) {
      case "text":
        return textPiece("text", textOf(block["text"]));
      case "thinking": {
        // The response joins thinking blocks with a separator, so the pieces must too.
        const separator = this.#thinkingBlocks > 0 ? reasoningSeparator : "";
        this.#thinkingBlocks += 1;
        return textPiece("reasoning", separator + textOf(block["thinking"]));
      }
      case "tool_use": {
        const toolIndex = this.#toolIndex.size;
        this.#toolIndex.set(index, toolIndex);
        const { id, name } = { id: textOf(block["id"]), name: textOf(block["name"]) };
        return [{ type: "tool-call", index: toolIndex, id, name, arguments: "" }];
      }
      default:
        return [];
    }
  }

  #addDelta(index: number, delta: Record<string, unknown>): ChatStreamEvent[] {
    const block = this.#blocks[index];
    if (block === undefined)
      throw new ReplyFormatError(`a delta for block ${index}, never started`);
    switch (delta["type"]) {
      case "text_delta":
        return appendText(block, "text", "text", textOf(delta["text"]));
      case "thinking_delta":
        return appendText(block, "thinking", "reasoning", textOf(delta["thinking"]));
      case "signature_delta":
        block["signature"] = textOf(delta["signature"]);
        return [];
      case "input_json_delta": {
        const piece = textOf(delta["partial_json"]);
        this.#inputJson.set(index, (this.#inputJson.get(index) ?? "") + piece);
        const toolIndex = this.#toolIndex.get(index);
        return toolIndex === undefined
          ? []
          : [{ type: "tool-call", index: toolIndex, arguments: piece }];
      }
      default:
        // `citations_delta`, and delta types the API adds later.
        return [];
    }
  }

  /** A block's tool input is complete only when the block stops. */
  #stopBlock(index: number): void {
    const json = this.#inputJson.get(index);
    const block = this.#blocks[index];
    if (json === undefined || block === undefined) return;
    const input: unknown = json.trim() === "" ? {} : parseJson(json);
    if (!isPlainObject(input)) throw new ReplyFormatError("a tool input isn't a JSON object");
    block["input"] = input;
  }

  #addMessageDelta(data: Record<string, unknown>): void {
    const delta = recordOf(data["delta"]);
    // The usage here counts the whole answer so far; it updates what message_start said.
    const usage = { ...recordOf(this.#message["usage"]), ...countsOf(data["usage"]) };
    this.#message = { ...this.#message, ...delta, usage };
  }
}

/**
 * The usage fields that hold a number. `message_delta` may send `null` for a
 * count it doesn't update, such as `input_tokens`; that must not overwrite
 * what `message_start` said.
 */
function countsOf(value: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [field, count] of Object.entries(recordOf(value))) {
    if (typeof count === "number") counts[field] = count;
  }
  return counts;
}

/** Adds `text` to a block's `field`, and gives it on as a piece of our `type`. */
function appendText(
  block: Record<string, unknown>,
  field: "text" | "thinking",
  type: "text" | "reasoning",
  text: string,
): ChatStreamEvent[] {
  block[field] = textOf(block[field]) + text;
  return textPiece(type, text);
}

function textPiece(type: "text" | "reasoning", delta: string): ChatStreamEvent[] {
  return delta === "" ? [] : [{ type, delta }];
}

function parseData(text: string): Record<string, unknown> {
  const data = parseJson(text);
  if (!isPlainObject(data)) throw new ReplyFormatError("a stream event isn't a JSON object");
  return data;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ReplyFormatError("the stream holds text that isn't JSON", { cause: error });
  }
}

function indexOf(data: Record<string, unknown>): number {
  const index = data["index"];
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
    throw new ReplyFormatError("a block event has no index");
  }
  return index;
}

function recordOf(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}
