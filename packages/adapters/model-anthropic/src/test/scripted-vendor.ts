import type { ChatResponse, HttpClient } from "@halonicjs/ports";
import { wireMessage } from "./wire-replies.ts";

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
  | { kind: "answer"; answer: Omit<ChatResponse, "replay"> }
  | { kind: "reply"; status: number; body: unknown }
  | { kind: "hang" }
  | { kind: "stall"; status: number }
  | { kind: "flood" }
  | { kind: "unreachable" };

/** How many bytes the body sends at a time, so characters split across chunks. */
const chunkSize = 7;

/**
 * A fake Anthropic server behind the {@link HttpClient} port. It plays
 * scripted steps in order, answering in the Messages API's JSON. It counts
 * the calls still open: a call closes when its body is read to the end or
 * cancelled, or when its signal aborts it before it answers.
 */
export class ScriptedVendor implements HttpClient {
  readonly received: ReceivedCall[] = [];
  readonly #steps: Step[] = [];
  #open = 0;

  /** Answers the next call with `answer`, written as Anthropic would. */
  answerNext(answer: Omit<ChatResponse, "replay">): void {
    this.#steps.push({ kind: "answer", answer });
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
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const headers = { ...(init.headers as Record<string, string>) };
    this.received.push({ url, method: init.method, redirect: init.redirect, headers, body });
    const step = this.#steps.shift();
    if (step === undefined) throw new Error("the scripted vendor has no step left");
    if (step.kind === "unreachable") throw new TypeError("fetch failed");
    this.#open += 1;
    if (step.kind === "hang") {
      await untilAborted(init.signal);
      this.#open -= 1;
      throw init.signal?.reason;
    }
    if (step.kind === "stall") return this.#stalled(step.status, init.signal);
    if (step.kind === "flood") return this.#flooded();
    const reply = step.kind === "reply" ? step : { status: 200, body: wireMessage(step.answer) };
    return this.#response(reply.status, JSON.stringify(reply.body));
  }

  /** A response whose body sends `text` in small chunks, and closes the call once it is read or cancelled. */
  #response(status: number, text: string): Response {
    const bytes = new TextEncoder().encode(text);
    let offset = 0;
    let closed = false;
    const close = (): void => {
      if (!closed) this.#open -= 1;
      closed = true;
    };
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset < bytes.length) {
          controller.enqueue(bytes.slice(offset, offset + chunkSize));
          offset += chunkSize;
          return;
        }
        close();
        controller.close();
      },
      cancel: close,
    });
    return new Response(body, { status, headers: { "content-type": "application/json" } });
  }

  /** A response whose body waits for `signal` to abort, then fails with its reason. */
  #stalled(status: number, signal: AbortSignal | null | undefined): Response {
    const close = (): void => {
      this.#open -= 1;
    };
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await untilAborted(signal);
        close();
        controller.error(signal?.reason);
      },
      cancel: close,
    });
    return new Response(body, { status, headers: { "content-type": "application/json" } });
  }

  /** A 200 response whose body never ends, and closes the call once it is cancelled. */
  #flooded(): Response {
    const body = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.enqueue(floodPiece),
      cancel: () => {
        this.#open -= 1;
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  }
}

/** One piece of a flooded body. */
const floodPiece = new Uint8Array(1024 * 1024).fill(0x20);

function untilAborted(signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal === undefined || signal === null) return;
    if (signal.aborted) resolve();
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
