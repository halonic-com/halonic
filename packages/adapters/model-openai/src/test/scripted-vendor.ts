import type { ChatResponse, HttpClient } from "@halonicjs/ports";

/** What the model answers on one call, as the contract suite scripts it. */
type Answer = Omit<ChatResponse, "replay">;

/** A call the vendor received: its address, method, redirect mode, headers and parsed JSON body. */
export interface ReceivedCall {
  url: string;
  method: string | undefined;
  redirect: RequestInit["redirect"];
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** What the vendor does on one call. */
type Step =
  | { kind: "answer"; answer: Answer }
  | { kind: "reply"; status: number; body: unknown }
  | { kind: "hang"; partialText: string }
  | { kind: "stall"; status: number }
  | { kind: "flood" }
  | { kind: "unreachable" };

/** How many bytes the vendor sends at a time: few, so events and characters break across reads. */
const bytesPerRead = 7;

/** How many characters a streamed text piece holds. */
const charactersPerPiece = 4;

/**
 * A fake OpenAI-compatible server behind the {@link HttpClient} port. It
 * plays scripted steps in order, answering in the chat completions wire
 * format, as server-sent events when the call asks to stream. It counts the
 * calls still open: a call closes when its body is read to the end or
 * cancelled, or when its signal aborts it.
 */
export class ScriptedVendor implements HttpClient {
  readonly received: ReceivedCall[] = [];
  readonly #steps: Step[] = [];
  #open = 0;

  /** Answers the next call with `answer`, written as OpenAI would. */
  answerNext(answer: Answer): void {
    this.#steps.push({ kind: "answer", answer });
  }

  /** Answers the next call with `status` and the JSON `body`. */
  replyNext(status: number, body: unknown): void {
    this.#steps.push({ kind: "reply", status, body });
  }

  /** Keeps the next call waiting until its signal aborts; a streamed call first sends `partialText`. */
  hangNext(partialText = ""): void {
    this.#steps.push({ kind: "hang", partialText });
  }

  /** Answers the next call with `status`, then sends no body until its signal aborts. */
  stallNext(status: number): void {
    this.#steps.push({ kind: "stall", status });
  }

  /** Answers the next call with 200 and a body that never ends, 1 MiB at a time. */
  floodNext(): void {
    this.#steps.push({ kind: "flood" });
  }

  /** Fails the next call as a network failure would. */
  unreachableNext(): void {
    this.#steps.push({ kind: "unreachable" });
  }

  calls(): { started: number; open: number } {
    return { started: this.received.length, open: this.#open };
  }

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    init.signal?.throwIfAborted();
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    this.received.push({
      url,
      method: init.method,
      redirect: init.redirect,
      headers: { ...(init.headers as Record<string, string>) },
      body,
    });
    const step = this.#steps.shift();
    if (step === undefined) throw new Error("the scripted vendor has no step left");
    if (step.kind === "unreachable") throw new TypeError("fetch failed");
    this.#open += 1;
    const streams = body["stream"] === true;
    if (step.kind === "hang" && !streams) {
      await untilAborted(init.signal);
      this.#open -= 1;
      throw init.signal?.reason;
    }
    if (step.kind === "stall") return jsonResponse(step.status, this.#stalled(init.signal));
    if (step.kind === "flood") return jsonResponse(200, this.#flooded());
    const [status, text, hangs] = this.#replyTo(step, streams);
    return new Response(this.#body(text, hangs, init.signal), {
      status,
      headers: { "content-type": streams ? "text/event-stream" : "application/json" },
    });
  }

  #replyTo(
    step: Extract<Step, { kind: "reply" | "hang" | "answer" }>,
    streams: boolean,
  ): [number, string, boolean] {
    switch (step.kind) {
      case "reply":
        return [step.status, JSON.stringify(step.body), false];
      case "hang":
        return [
          200,
          events([{ choices: [{ index: 0, delta: { content: step.partialText } }] }]),
          true,
        ];
      case "answer":
        if (!streams) return [200, JSON.stringify(wireReply(step.answer)), false];
        return [200, `${events(wireChunks(step.answer))}data: [DONE]\n\n`, false];
    }
  }

  /**
   * A body that sends `text` a few bytes at a time, then ends, or with
   * `hangs` waits for the signal. Aborting errors it, as `fetch` does. The
   * call closes once the body ends, fails or is cancelled.
   */
  #body(
    text: string,
    hangs: boolean,
    signal: AbortSignal | null | undefined,
  ): ReadableStream<Uint8Array> {
    const bytes = new TextEncoder().encode(text);
    let sent = 0;
    let closed = false;
    const close = (): void => {
      if (!closed) this.#open -= 1;
      closed = true;
    };
    return new ReadableStream({
      start(controller) {
        signal?.addEventListener("abort", () => {
          if (closed) return;
          controller.error(signal.reason);
          close();
        });
      },
      async pull(controller) {
        if (sent < bytes.length) {
          controller.enqueue(bytes.slice(sent, sent + bytesPerRead));
          sent += bytesPerRead;
          return;
        }
        if (hangs) return untilAborted(signal);
        controller.close();
        close();
      },
      cancel: close,
    });
  }

  /** A body that waits for `signal` to abort, then fails with its reason. */
  #stalled(signal: AbortSignal | null | undefined): ReadableStream<Uint8Array> {
    const close = (): void => {
      this.#open -= 1;
    };
    return new ReadableStream({
      async pull(controller) {
        await untilAborted(signal);
        close();
        controller.error(signal?.reason);
      },
      cancel: close,
    });
  }

  /** A body that never ends, and closes the call once it is cancelled. */
  #flooded(): ReadableStream<Uint8Array> {
    return new ReadableStream({
      pull: (controller) => controller.enqueue(floodPiece),
      cancel: () => {
        this.#open -= 1;
      },
    });
  }
}

/** One piece of a flooded body. */
const floodPiece = new Uint8Array(1024 * 1024).fill(0x20);

function jsonResponse(status: number, body: ReadableStream<Uint8Array>): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

/** `answer` in the chat completions wire format, with reasoning as LM Studio sends it. */
function wireReply(answer: Answer): Record<string, unknown> {
  const toolCalls = answer.toolCalls.map((call) => ({
    id: call.id,
    type: "function",
    function: { name: call.name, arguments: JSON.stringify(call.arguments) },
  }));
  const message = {
    role: "assistant",
    content: answer.content === "" && toolCalls.length > 0 ? null : answer.content,
    ...(answer.reasoning === undefined ? {} : { reasoning_content: answer.reasoning }),
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };
  return {
    id: "chatcmpl-1",
    object: "chat.completion",
    choices: [{ index: 0, message, finish_reason: answer.finishReason }],
    usage: wireUsage(answer),
  };
}

/** `answer` as streamed chunks: reasoning, text, then each tool call named first and its arguments in pieces. */
function wireChunks(answer: Answer): unknown[] {
  const deltas: Record<string, unknown>[] = [
    ...piecesOf(answer.reasoning ?? "", charactersPerPiece).map((piece) => ({
      reasoning_content: piece,
    })),
    ...piecesOf(answer.content, charactersPerPiece).map((piece) => ({ content: piece })),
  ];
  for (const [index, call] of answer.toolCalls.entries()) {
    const named = {
      index,
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: "" },
    };
    deltas.push({ tool_calls: [named] });
    for (const piece of piecesOf(JSON.stringify(call.arguments), 5)) {
      deltas.push({ tool_calls: [{ index, function: { arguments: piece } }] });
    }
  }
  return [
    ...deltas.map((delta) => ({ choices: [{ index: 0, delta }] })),
    { choices: [{ index: 0, delta: {}, finish_reason: answer.finishReason }] },
    { choices: [], usage: wireUsage(answer) },
  ];
}

function wireUsage(answer: Answer): Record<string, number> {
  const { inputTokens, outputTokens } = answer.usage;
  return {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
  };
}

/** `text` in pieces of `size` characters, never splitting one. */
function piecesOf(text: string, size: number): string[] {
  const characters = Array.from(text);
  const pieces: string[] = [];
  for (let start = 0; start < characters.length; start += size) {
    pieces.push(characters.slice(start, start + size).join(""));
  }
  return pieces;
}

function events(chunks: unknown[]): string {
  return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("");
}

function untilAborted(signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal === undefined || signal === null) return;
    if (signal.aborted) resolve();
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
