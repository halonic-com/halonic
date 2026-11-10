import type { ChatResponse, ChatStreamEvent } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import { parseArguments, ReplyFormatError, readFinishReason, readUsage, textOf } from "./reply.ts";

/**
 * Thrown when the server sends an error as a streamed event after it took
 * the call with 200, as OpenAI, vLLM, LiteLLM and Ollama do.
 */
export class StreamedErrorEvent extends Error {
  override readonly name = "StreamedErrorEvent";
  /** The error event's data, as the server sent it. */
  readonly event: string;

  constructor(event: string) {
    super("the server sent an error in the stream");
    this.event = event;
  }
}

/** A tool call as its pieces have come in so far. */
interface ToolCallSoFar {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Builds a streamed chat completions answer up from its chunks: each chunk
 * gives the events to pass on, and {@link StreamedReply.response} the full
 * {@link ChatResponse} at the end, read the same way `readReply` reads a
 * whole reply.
 */
export class StreamedReply {
  #chunks = 0;
  #content = "";
  #reasoning = "";
  readonly #toolCalls: ToolCallSoFar[] = [];
  /** Each call's place in `#toolCalls`, by the index the server gave it; servers may not start at 0. */
  readonly #toolCallPositions = new Map<number, number>();
  #finishReason: unknown;
  #usage: ChatResponse["usage"] = { inputTokens: 0, outputTokens: 0 };

  /**
   * The events in one chunk, in the order the model wrote them.
   *
   * @throws {ReplyFormatError} when the chunk isn't a chat completions chunk
   * @throws {StreamedErrorEvent} when the chunk is an error
   */
  add(chunk: unknown): ChatStreamEvent[] {
    if (!isPlainObject(chunk)) throw new ReplyFormatError("a streamed chunk isn't an object");
    if (chunk["error"] !== undefined) throw new StreamedErrorEvent(JSON.stringify(chunk));
    this.#chunks += 1;
    // With `include_usage`, the usage comes in a last chunk without choices.
    if (isPlainObject(chunk["usage"])) this.#usage = readUsage(chunk["usage"]);
    const choices = chunk["choices"];
    const choice: unknown = Array.isArray(choices) ? choices[0] : undefined;
    if (!isPlainObject(choice)) return [];
    if (typeof choice["finish_reason"] === "string") this.#finishReason = choice["finish_reason"];
    const delta = isPlainObject(choice["delta"]) ? choice["delta"] : {};
    return [...this.#reasoningOf(delta), ...this.#textOf(delta), ...this.#toolCallsOf(delta)];
  }

  /**
   * The full answer, once the stream has ended.
   *
   * @throws {ReplyFormatError} when no chunk came, as when the server ignored
   * `stream: true` and sent one whole reply, or sent an empty body
   */
  response(): ChatResponse {
    if (this.#chunks === 0) throw new ReplyFormatError("the stream had no chunks");
    const toolCalls = this.#toolCalls.map((call, index) => ({
      // Some local servers leave the id out; each call still needs its own.
      id: call.id || `call_${index}`,
      name: call.name,
      arguments: parseArguments(call.arguments),
    }));
    return {
      content: this.#content,
      ...(this.#reasoning === "" ? {} : { reasoning: this.#reasoning }),
      toolCalls,
      usage: this.#usage,
      finishReason: readFinishReason(this.#finishReason, toolCalls.length > 0),
    };
  }

  /** LM Studio streams reasoning as `reasoning_content`, Ollama as `reasoning`. */
  #reasoningOf(delta: Record<string, unknown>): ChatStreamEvent[] {
    const piece = textOf(delta["reasoning_content"]) || textOf(delta["reasoning"]);
    if (piece === "") return [];
    this.#reasoning += piece;
    return [{ type: "reasoning", delta: piece }];
  }

  #textOf(delta: Record<string, unknown>): ChatStreamEvent[] {
    const piece = textOf(delta["content"]);
    if (piece === "") return [];
    this.#content += piece;
    return [{ type: "text", delta: piece }];
  }

  /**
   * The first piece of a call names it; later pieces with the same index add
   * to its arguments. Events number the calls in the order they first came.
   */
  #toolCallsOf(delta: Record<string, unknown>): ChatStreamEvent[] {
    const pieces = Array.isArray(delta["tool_calls"]) ? delta["tool_calls"] : [];
    return pieces.filter(isPlainObject).map((piece) => {
      const index = this.#positionOf(piece["index"]);
      const fn = isPlainObject(piece["function"]) ? piece["function"] : {};
      const call = this.#toolCalls[index] ?? { id: "", name: "", arguments: "" };
      this.#toolCalls[index] = call;
      const id = textOf(piece["id"]);
      const name = textOf(fn["name"]);
      const args = argumentsText(fn["arguments"]);
      call.id ||= id;
      call.name ||= name;
      call.arguments += args;
      return {
        type: "tool-call",
        index,
        ...(id === "" ? {} : { id }),
        ...(name === "" ? {} : { name }),
        arguments: args,
      };
    });
  }

  /** The place of the call the server numbered `serverIndex`; a piece without a number starts a new call. */
  #positionOf(serverIndex: unknown): number {
    if (typeof serverIndex !== "number") return this.#toolCalls.length;
    const known = this.#toolCallPositions.get(serverIndex);
    if (known !== undefined) return known;
    const position = this.#toolCalls.length;
    this.#toolCallPositions.set(serverIndex, position);
    return position;
  }
}

/** A piece of a call's arguments: JSON text, or an object some local servers send whole. */
function argumentsText(value: unknown): string {
  return isPlainObject(value) ? JSON.stringify(value) : textOf(value);
}
