import type { ChatResponse, ChatStreamEvent } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import { parseArguments, ReplyFormatError, readFinishReason, readUsage, textOf } from "./reply.ts";

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
  #content = "";
  #reasoning = "";
  readonly #toolCalls: ToolCallSoFar[] = [];
  #finishReason: unknown;
  #usage: ChatResponse["usage"] = { inputTokens: 0, outputTokens: 0 };

  /**
   * The events in one chunk, in the order the model wrote them.
   *
   * @throws {ReplyFormatError} when the chunk isn't a chat completions chunk
   */
  add(chunk: unknown): ChatStreamEvent[] {
    if (!isPlainObject(chunk)) throw new ReplyFormatError("a streamed chunk isn't an object");
    // With `include_usage`, the usage comes in a last chunk without choices.
    if (isPlainObject(chunk["usage"])) this.#usage = readUsage(chunk["usage"]);
    const choices = chunk["choices"];
    const choice: unknown = Array.isArray(choices) ? choices[0] : undefined;
    if (!isPlainObject(choice)) return [];
    if (typeof choice["finish_reason"] === "string") this.#finishReason = choice["finish_reason"];
    const delta = isPlainObject(choice["delta"]) ? choice["delta"] : {};
    return [...this.#reasoningOf(delta), ...this.#textOf(delta), ...this.#toolCallsOf(delta)];
  }

  /** The full answer, once the stream has ended. */
  response(): ChatResponse {
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

  /** The first piece of a call names it; later pieces with the same index add to its arguments. */
  #toolCallsOf(delta: Record<string, unknown>): ChatStreamEvent[] {
    const pieces = Array.isArray(delta["tool_calls"]) ? delta["tool_calls"] : [];
    return pieces.filter(isPlainObject).map((piece) => {
      const index = typeof piece["index"] === "number" ? piece["index"] : this.#toolCalls.length;
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
}

/** A piece of a call's arguments: JSON text, or an object some local servers send whole. */
function argumentsText(value: unknown): string {
  return isPlainObject(value) ? JSON.stringify(value) : textOf(value);
}
