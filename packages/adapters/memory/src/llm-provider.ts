import type {
  ChatRequest,
  ChatResponse,
  ChatStreamEvent,
  LlmCapabilities,
  LlmProvider,
} from "@halonicjs/ports";
import { copyJson } from "./copy.ts";

/** How the scripted model behaves on one call. */
type Step =
  | { kind: "answer"; answer: ChatResponse }
  | { kind: "hang"; partialText: string }
  | { kind: "refuse" };

/** Settings for a {@link ScriptedLlmProvider}. */
export interface ScriptedLlmProviderOptions {
  /** The provider's id in the workspace; "scripted" by default. */
  id?: string;
  /** Whether it offers `stream()`; false by default. */
  streaming?: boolean;
}

/** How long a streamed piece is, in characters. Short, so every answer comes in several pieces. */
const pieceLength = 4;

/**
 * A model provider that plays scripted calls in order, for tests and the
 * browser demo. It never reaches a vendor. A streamed answer comes in short
 * pieces that add up to the `done` response.
 */
export class ScriptedLlmProvider implements LlmProvider {
  readonly id: string;
  readonly type = "scripted";
  readonly capabilities: LlmCapabilities;
  readonly stream?: (request: ChatRequest) => AsyncIterable<ChatStreamEvent>;
  readonly #steps: Step[] = [];
  #started = 0;
  #open = 0;

  constructor(options: ScriptedLlmProviderOptions = {}) {
    this.id = options.id ?? "scripted";
    const streaming = options.streaming ?? false;
    this.capabilities = { tools: true, jsonOutput: true, vision: false, streaming };
    if (streaming) this.stream = (request) => this.#stream(request);
  }

  /** Makes a later call answer with `answer`; calls take the scripted steps in order. */
  answerNext(answer: ChatResponse): void {
    this.#steps.push({ kind: "answer", answer: copyJson(answer) });
  }

  /** Makes a later call wait until its signal aborts; a stream first yields `partialText`. */
  hangNext(partialText = ""): void {
    this.#steps.push({ kind: "hang", partialText });
  }

  /** Makes a later call fail, as a vendor refusing it would. */
  refuseNext(): void {
    this.#steps.push({ kind: "refuse" });
  }

  /** How many calls have started, and how many of them haven't finished. */
  calls(): { started: number; open: number } {
    return { started: this.#started, open: this.#open };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const step = this.#begin(request);
    try {
      if (step.kind === "hang") await untilAborted(request.signal);
      return answerOf(step);
    } finally {
      this.#open -= 1;
    }
  }

  async *#stream(request: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const step = this.#begin(request);
    try {
      if (step.kind === "hang") {
        if (step.partialText !== "") yield { type: "text", delta: step.partialText };
        await untilAborted(request.signal);
      }
      const answer = answerOf(step);
      for (const event of piecesOf(answer)) {
        request.signal?.throwIfAborted();
        yield event;
      }
      yield { type: "done", response: answer };
    } finally {
      this.#open -= 1;
    }
  }

  /** Takes the next step for a call that may start, and counts it as open. */
  #begin(request: ChatRequest): Step {
    request.signal?.throwIfAborted();
    const step = this.#steps.shift();
    if (step === undefined) throw new Error(`The scripted model ${this.id} has no more calls.`);
    this.#started += 1;
    this.#open += 1;
    return step;
  }
}

/**
 * The response a step gives, or the refusal it throws. A hang only gets here once aborted.
 * Each step is taken once, so its answer goes out without another copy.
 */
function answerOf(step: Step): ChatResponse {
  if (step.kind !== "answer") throw new Error("The scripted model refused the call.");
  return step.answer;
}

/** Resolves never; rejects with the signal's reason once it aborts. */
function untilAborted(signal: AbortSignal | undefined): Promise<never> {
  if (signal === undefined) {
    return Promise.reject(new Error("A hanging scripted call needs a signal to end it."));
  }
  // A caller may abort while handling a partial delta, before the hang starts listening.
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

/** The deltas of an answer: reasoning, then text, then each tool call's arguments. */
function* piecesOf(answer: ChatResponse): Generator<ChatStreamEvent> {
  for (const delta of split(answer.reasoning ?? "")) yield { type: "reasoning", delta };
  for (const delta of split(answer.content)) yield { type: "text", delta };
  for (const [index, call] of answer.toolCalls.entries()) {
    // Only the first piece names the call, as most vendors stream it.
    for (const [piece, delta] of split(JSON.stringify(call.arguments)).entries()) {
      yield piece === 0
        ? { type: "tool-call", index, id: call.id, name: call.name, arguments: delta }
        : { type: "tool-call", index, arguments: delta };
    }
  }
}

/** Splits text into short pieces, never inside a character that takes two UTF-16 units. */
function split(text: string): string[] {
  const characters = [...text];
  const pieces: string[] = [];
  for (let start = 0; start < characters.length; start += pieceLength) {
    pieces.push(characters.slice(start, start + pieceLength).join(""));
  }
  return pieces;
}
