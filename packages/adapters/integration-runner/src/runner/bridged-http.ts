// The runner's `host.http`: each request crosses the bridge as a `fetch`
// frame, and Halonic's kit sends it. The response body is a stream that asks
// for one piece per read, so Halonic reads the real body only while the
// integration waits for it (design HAL-958, section 3.7).

import { IntegrationRefusedError } from "@halonicjs/integration-kit/integration";
import type {
  IntegrationHttpClient,
  IntegrationRequestInit,
  SecretPlacement,
} from "@halonicjs/ports";
import { encodeRequestBody, fromBase64 } from "../bodies.ts";
import { FrameTooLargeError } from "../frame-lines.ts";
import type { HalonicFrame, RunnerFrame } from "../frames.ts";
import { errorFromFailure } from "../request-errors.ts";

/** Sends one frame to Halonic. Throws {@link FrameTooLargeError} when it is too large to send. */
export type SendFrame = (frame: RunnerFrame) => void;

/** The frames Halonic answers a request with. */
export type ResponseFrame = Extract<HalonicFrame, { type: "head" | "error" | "chunk" | "end" }>;

/** Statuses whose response never has a body, so `Response` refuses one. */
const nullBodyStatuses = new Set([204, 205, 304]);

interface WaitingForHead {
  stage: "head";
  resolve(response: Response): void;
  reject(error: unknown): void;
  stopListening(): void;
}

interface ReadingBody {
  stage: "body";
  controller: ReadableStreamDefaultController<Uint8Array>;
  /** The read waiting for Halonic's answer to its `pull`. */
  waiting?: { resolve(): void; reject(error: unknown): void } | undefined;
  stopListening(): void;
}

type OpenRequest = WaitingForHead | ReadingBody;

/** The integration's `http`, carried over the bridge. */
export class BridgedHttp implements IntegrationHttpClient {
  readonly #send: SendFrame;
  readonly #currentCall: () => number | undefined;
  readonly #open = new Map<number, OpenRequest>();
  #nextId = 0;

  /**
   * @param send sends a frame to Halonic
   * @param currentCall the tool call the code asking runs in, or `undefined` outside every call
   */
  constructor(send: SendFrame, currentCall: () => number | undefined) {
    this.#send = send;
    this.#currentCall = currentCall;
  }

  fetch(url: string, init: IntegrationRequestInit = {}): Promise<Response> {
    const signal = init.signal ?? undefined;
    if (signal?.aborted) return Promise.reject(signal.reason);
    const call = this.#currentCall();
    if (call === undefined) {
      return Promise.reject(new Error("host.http can only be used during a tool call"));
    }
    let body: ReturnType<typeof encodeRequestBody>;
    try {
      body = encodeRequestBody(init.body);
    } catch (error) {
      return Promise.reject(error);
    }
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise<Response>((resolve, reject) => {
      try {
        this.#send({
          type: "fetch",
          id,
          call,
          url: String(url),
          method: init.method ?? "GET",
          headers: [...new Headers(init.headers)],
          body,
          auth: placements(init.auth),
        });
      } catch (error) {
        if (!(error instanceof FrameTooLargeError)) throw error;
        throw new IntegrationRefusedError(
          "request-too-large",
          "the request's address and headers are too large",
        );
      }
      const onAbort = () => this.#abort(id, signal?.reason);
      signal?.addEventListener("abort", onAbort, { once: true });
      const stopListening = () => signal?.removeEventListener("abort", onAbort);
      this.#open.set(id, { stage: "head", resolve, reject, stopListening });
    });
  }

  /** Takes Halonic's answer to a request. An answer for a request already given up on is dropped. */
  take(frame: ResponseFrame): void {
    const request = this.#open.get(frame.id);
    if (request === undefined) return;
    switch (frame.type) {
      case "head":
        if (request.stage === "head") this.#takeHead(frame, request);
        return;
      case "error":
        this.#finish(frame.id, request, errorFromFailure(frame));
        return;
      case "chunk":
        if (request.stage !== "body") return;
        if (frame.base64 !== "") request.controller.enqueue(fromBase64(frame.base64));
        request.waiting?.resolve();
        request.waiting = undefined;
        return;
      case "end":
        this.#finish(frame.id, request, null);
        return;
    }
  }

  #takeHead(frame: Extract<ResponseFrame, { type: "head" }>, request: WaitingForHead): void {
    const hasBody = frame.hasBody && !nullBodyStatuses.has(frame.status);
    if (frame.hasBody && !hasBody) this.#send({ type: "cancel-body", body: frame.id });
    let body: ReadableStream<Uint8Array> | null = null;
    if (hasBody) {
      body = this.#bodyStream(frame.id, request.stopListening);
    } else {
      this.#open.delete(frame.id);
      request.stopListening();
    }
    const response = new Response(body, {
      status: frame.status,
      statusText: frame.statusText,
      headers: frame.headers,
    });
    // `Response` has no option for its URL; in-process it is the final address after redirects.
    Object.defineProperty(response, "url", { value: frame.url });
    request.resolve(response);
  }

  #bodyStream(id: number, stopListening: () => void): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>(
      {
        start: (controller) => {
          this.#open.set(id, { stage: "body", controller, stopListening });
        },
        pull: () =>
          new Promise<void>((resolve, reject) => {
            const request = this.#open.get(id);
            if (request?.stage !== "body") return resolve();
            request.waiting = { resolve, reject };
            this.#send({ type: "pull", body: id });
          }),
        cancel: () => {
          const request = this.#open.get(id);
          if (request === undefined) return;
          this.#open.delete(id);
          request.stopListening();
          this.#send({ type: "cancel-body", body: id });
        },
      },
      // Nothing is read ahead: `pull` runs only when the integration reads.
      { highWaterMark: 0 },
    );
  }

  /** The integration's signal aborted: tell Halonic and fail what waits, as in-process. */
  #abort(id: number, reason: unknown): void {
    const request = this.#open.get(id);
    if (request === undefined) return;
    this.#send({ type: "abort", id });
    this.#finish(id, request, reason);
  }

  /** Ends a request: with `null` the body ends normally, otherwise it fails with `error`. */
  #finish(id: number, request: OpenRequest, error: unknown): void {
    this.#open.delete(id);
    request.stopListening();
    if (request.stage === "head") {
      request.reject(error);
      return;
    }
    if (error === null) request.controller.close();
    else request.controller.error(error);
    request.waiting?.resolve();
  }
}

function placements(auth: IntegrationRequestInit["auth"]): SecretPlacement[] {
  if (auth === undefined) return [];
  return Array.isArray(auth) ? [...auth] : [auth as SecretPlacement];
}
