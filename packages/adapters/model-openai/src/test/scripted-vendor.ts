import type { ChatResponse, HttpClient } from "@halonicjs/ports";

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
  | { kind: "reply"; status: number; body: unknown }
  | { kind: "hang" }
  | { kind: "stall"; status: number }
  | { kind: "flood" }
  | { kind: "unreachable" };

/**
 * A fake OpenAI-compatible server behind the {@link HttpClient} port. It
 * plays scripted steps in order, answering in the chat completions wire
 * format, and counts the calls still open: a call closes when its body is
 * read to the end or cancelled, or when its signal aborts it.
 */
export class ScriptedVendor implements HttpClient {
  readonly received: ReceivedCall[] = [];
  readonly #steps: Step[] = [];
  #open = 0;

  /** Answers the next call with `answer`, written as OpenAI would. */
  answerNext(answer: Omit<ChatResponse, "replay">): void {
    this.replyNext(200, wireReply(answer));
  }

  /** Answers the next call with `status` and the JSON `body`. */
  replyNext(status: number, body: unknown): void {
    this.#steps.push({ kind: "reply", status, body });
  }

  /** Keeps the next call waiting until its signal aborts. */
  hangNext(): void {
    this.#steps.push({ kind: "hang" });
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
    this.received.push({
      url,
      method: init.method,
      redirect: init.redirect,
      headers: { ...(init.headers as Record<string, string>) },
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    });
    const step = this.#steps.shift();
    if (step === undefined) throw new Error("the scripted vendor has no step left");
    if (step.kind === "unreachable") throw new TypeError("fetch failed");
    this.#open += 1;
    if (step.kind === "hang") {
      await untilAborted(init.signal);
      this.#open -= 1;
      throw init.signal?.reason;
    }
    if (step.kind === "stall") return jsonResponse(step.status, this.#stalled(init.signal));
    if (step.kind === "flood") return jsonResponse(200, this.#flooded());
    return jsonResponse(step.status, this.#body(JSON.stringify(step.body)));
  }

  /** A body that closes the call once it is read to the end or cancelled. */
  #body(text: string): ReadableStream<Uint8Array> {
    let closed = false;
    const close = (): void => {
      if (!closed) this.#open -= 1;
      closed = true;
    };
    return new ReadableStream({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode(text));
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
function wireReply(answer: Omit<ChatResponse, "replay">): Record<string, unknown> {
  const toolCalls = answer.toolCalls.map((call) => ({
    id: call.id,
    type: "function",
    function: { name: call.name, arguments: JSON.stringify(call.arguments) },
  }));
  return {
    id: "chatcmpl-1",
    object: "chat.completion",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: answer.content === "" && toolCalls.length > 0 ? null : answer.content,
          ...(answer.reasoning === undefined ? {} : { reasoning_content: answer.reasoning }),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: answer.finishReason,
      },
    ],
    usage: {
      prompt_tokens: answer.usage.inputTokens,
      completion_tokens: answer.usage.outputTokens,
      total_tokens: answer.usage.inputTokens + answer.usage.outputTokens,
    },
  };
}

function untilAborted(signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal === undefined || signal === null) return;
    if (signal.aborted) resolve();
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
