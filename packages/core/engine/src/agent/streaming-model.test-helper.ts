// A scripted provider that streams, for the tests of streamed model calls.

import type { ChatRequest, ChatResponse, ChatStreamEvent } from "@halonicjs/ports";
import { ScriptedModel } from "../testing/scripted-model.ts";

/** An answer that streams some pieces and then fails part way. */
export interface BrokenStream {
  readonly pieces: ChatStreamEvent[];
  readonly error: Error;
}

/** A provider that streams: each answer is its pieces, then an error or the end, or the failure at once. */
export class StreamingModel extends ScriptedModel {
  override readonly capabilities = {
    tools: true,
    jsonOutput: false,
    vision: false,
    streaming: true,
  };
  readonly streamed: ChatRequest[] = [];
  private readonly streams: (ChatStreamEvent[] | Error | BrokenStream)[];
  private readonly failAfterPieces: Error | undefined;

  constructor(
    streams: (ChatStreamEvent[] | Error | BrokenStream)[],
    id: string,
    failAfterPieces?: Error,
  ) {
    super([], id);
    this.streams = [...streams];
    this.failAfterPieces = failAfterPieces;
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    this.streamed.push(request);
    const next = this.streams.shift();
    if (next instanceof Error) {
      throw next;
    }
    if (next !== undefined && !Array.isArray(next)) {
      yield* next.pieces;
      throw next.error;
    }
    for (const event of next ?? []) {
      yield event;
    }
    if (this.failAfterPieces !== undefined) {
      throw this.failAfterPieces;
    }
  }
}

/** A response as a stream: its text in two pieces, then `done`. */
export const streamed = (response: ChatResponse): ChatStreamEvent[] => [
  { type: "text", delta: response.content.slice(0, 3) },
  { type: "text", delta: response.content.slice(3) },
  { type: "done", response },
];
