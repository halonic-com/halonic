// Halonic's table of the runner's requests and response bodies. Each `fetch`
// frame goes to the kit's client, which checks it exactly as in-process;
// the runner owns a body from its `head` until `end`, an error, or its own
// `cancel-body`, and reads it one `pull` at a time, so the kit's idle timer
// runs only while the integration waits (design HAL-958, section 3.7).
// A request belongs to its tool call and is closed when the call stops
// running, so no network work outlives the call (A37, HAL-4353).

import {
  IntegrationRefusedError,
  leakAttemptCodes,
  type RefusalCode,
} from "@halonicjs/adapter-integration-kit";
import type { IntegrationHttpClient, SecretPlacement } from "@halonicjs/ports";
import { decodeRequestBody, toBase64 } from "../bodies.ts";
import { FrameTooLargeError } from "../frame-lines.ts";
import type { FetchFrame, HalonicFrame } from "../frames.ts";
import { type RequestFailure, requestFailure } from "../request-errors.ts";
import type { CallTable } from "./calls.ts";
import type { RunnerLimits } from "./limits.ts";

/** What the request table needs from the bridge. */
export interface RequestTableHooks {
  /** Sends a frame. Throws {@link FrameTooLargeError} when it is too large to send. */
  send(frame: HalonicFrame): void;
  /** The runner broke the protocol (A33). */
  violation(detail: string): void;
  /** The kit refused a request with a code on its leak list. */
  onLeakAttempt(code: RefusalCode): void;
}

interface TableRequest {
  /** The tool call the request was sent in. */
  readonly call: number;
  readonly abort: AbortController;
  /** The response body, once its `head` has been sent. */
  reader?: ReadableStreamDefaultReader<Uint8Array>;
  /** The rest of a piece larger than one `chunk` frame takes. */
  leftover?: Uint8Array | undefined;
  /** A `pull` is being answered; a second one at the same time breaks the protocol. */
  pulling: boolean;
}

/** Halonic's record of the runner's requests. */
export class RequestTable {
  readonly #http: IntegrationHttpClient;
  readonly #calls: CallTable;
  readonly #limits: RunnerLimits;
  readonly #hooks: RequestTableHooks;
  readonly #live = new Map<number, TableRequest>();
  /** Request numbers only go up, so a number can't be used twice and none need remembering. */
  #lastId = -1;
  /**
   * Requests closed because their call ended. The runner's `pull` or
   * `cancel-body` for one may have crossed the call's end on the wire, so it is
   * ignored, not a violation. At most `maxRequestsInFlight` join per call.
   */
  readonly #closedWithCall = new Set<number>();

  constructor(
    http: IntegrationHttpClient,
    calls: CallTable,
    limits: RunnerLimits,
    hooks: RequestTableHooks,
  ) {
    this.#http = http;
    this.#calls = calls;
    this.#limits = limits;
    this.#hooks = hooks;
  }

  /** Takes a `fetch` frame. */
  fetch(frame: FetchFrame): void {
    if (frame.id <= this.#lastId) {
      this.#hooks.violation("a request number used twice");
      return;
    }
    this.#lastId = frame.id;
    if (!this.#calls.wasStarted(frame.call)) {
      this.#hooks.violation("a request for a call Halonic never started");
      return;
    }
    if (!this.#calls.isRunning(frame.call)) {
      this.#fail(frame.id, {
        code: "call-not-running",
        message: "a request can only be sent while its tool call is running",
      });
      return;
    }
    if (this.#live.size >= this.#limits.maxRequestsInFlight) {
      this.#fail(frame.id, {
        code: "too-many-requests",
        message: `at most ${this.#limits.maxRequestsInFlight} requests can be in flight at once`,
      });
      return;
    }
    const tooLarge = this.#requestTooLarge(frame);
    if (tooLarge !== undefined) {
      this.#fail(frame.id, { code: "request-too-large", message: tooLarge });
      return;
    }
    let body: ReturnType<typeof decodeRequestBody>;
    try {
      body = decodeRequestBody(frame.body);
    } catch {
      this.#hooks.violation("a request body that is not base64");
      return;
    }
    const entry: TableRequest = {
      call: frame.call,
      abort: new AbortController(),
      pulling: false,
    };
    this.#live.set(frame.id, entry);
    this.#send(frame, body, entry).catch((error) => this.#broke(error));
  }

  /** Takes a `pull` frame: answers with one `chunk`, the `end` or an `error`. */
  pull(id: number): void {
    if (this.#closedWithCall.has(id)) return;
    const entry = this.#live.get(id);
    if (entry?.reader === undefined) {
      this.#hooks.violation("a pull for a body the runner doesn't own");
      return;
    }
    if (entry.pulling) {
      this.#hooks.violation("a second pull before the first was answered");
      return;
    }
    entry.pulling = true;
    this.#readPiece(id, entry, entry.reader).catch((error) => this.#broke(error));
  }

  /** Takes a `cancel-body` frame: the integration stopped reading. */
  cancelBody(id: number): void {
    if (this.#closedWithCall.has(id)) return;
    const entry = this.#live.get(id);
    if (entry?.reader === undefined) {
      this.#hooks.violation("a cancel for a body the runner doesn't own");
      return;
    }
    this.#close(id, entry);
  }

  /** Takes an `abort` frame: the integration's signal aborted. */
  abort(id: number): void {
    if (id > this.#lastId) {
      this.#hooks.violation("an abort for a request never sent");
      return;
    }
    const entry = this.#live.get(id);
    // Already answered: the abort crossed the answer on the way.
    if (entry !== undefined) this.#close(id, entry);
  }

  /**
   * Closes every request of a call that stopped running: aborts the kit's
   * request, drops its body, frees its slot, and tells the runner.
   */
  closeCall(call: number): void {
    for (const [id, entry] of this.#live) {
      if (entry.call !== call) continue;
      this.#close(id, entry);
      this.#closedWithCall.add(id);
      this.#fail(id, {
        code: "call-not-running",
        message: "the request was closed because its tool call ended",
      });
    }
  }

  /** Aborts every request and drops every body, when the runner stops. */
  closeAll(): void {
    for (const [id, entry] of this.#live) this.#close(id, entry);
  }

  async #send(frame: FetchFrame, body: ReturnType<typeof decodeRequestBody>, entry: TableRequest) {
    let response: Response;
    try {
      response = await this.#http.fetch(frame.url, {
        method: frame.method,
        headers: frame.headers,
        body,
        auth: frame.auth.map(toPlacement),
        signal: entry.abort.signal,
      });
    } catch (error) {
      if (!this.#isLive(frame.id, entry)) return;
      this.#live.delete(frame.id);
      if (error instanceof IntegrationRefusedError && leakAttemptCodes.includes(error.code)) {
        this.#hooks.onLeakAttempt(error.code);
      }
      return this.#fail(frame.id, requestFailure(error));
    }
    if (!this.#isLive(frame.id, entry)) return dropBody(response.body);
    this.#sendHead(frame.id, entry, response);
  }

  #sendHead(id: number, entry: TableRequest, response: Response): void {
    const hasBody = response.body !== null;
    try {
      this.#hooks.send({
        type: "head",
        id,
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers],
        url: response.url,
        hasBody,
      });
    } catch (error) {
      if (!(error instanceof FrameTooLargeError)) throw error;
      this.#live.delete(id);
      dropBody(response.body);
      this.#fail(id, {
        code: "response-too-large",
        message: "the response headers are too large",
      });
      return;
    }
    if (response.body === null) this.#live.delete(id);
    else entry.reader = response.body.getReader();
  }

  async #readPiece(
    id: number,
    entry: TableRequest,
    reader: ReadableStreamDefaultReader<Uint8Array>,
  ) {
    let piece = entry.leftover;
    if (piece === undefined) {
      let read: Awaited<ReturnType<typeof reader.read>>;
      try {
        read = await reader.read();
      } catch (error) {
        if (!this.#isLive(id, entry)) return;
        this.#live.delete(id);
        return this.#fail(id, requestFailure(error));
      }
      if (!this.#isLive(id, entry)) return;
      if (read.done) {
        this.#live.delete(id);
        return this.#hooks.send({ type: "end", id });
      }
      piece = read.value;
    }
    this.#sendPiece(id, entry, piece);
  }

  /** Sends one `chunk`, keeping what doesn't fit for the next `pull`. */
  #sendPiece(id: number, entry: TableRequest, piece: Uint8Array): void {
    const max = this.#limits.maxBodyPieceBytes;
    entry.leftover = piece.byteLength > max ? piece.subarray(max) : undefined;
    entry.pulling = false;
    this.#hooks.send({ type: "chunk", id, base64: toBase64(piece.subarray(0, max)) });
  }

  /** Why a request is too large to send to the kit, or `undefined` when it isn't (section 3.3). */
  #requestTooLarge(frame: FetchFrame): string | undefined {
    const limits = this.#limits;
    if (frame.headers.length > limits.maxRequestHeaders) {
      return `a request can have at most ${limits.maxRequestHeaders} headers`;
    }
    if (frame.auth.length > limits.maxSecretPlacements) {
      return `a request can have at most ${limits.maxSecretPlacements} secret placements`;
    }
    if (requestHeadBytes(frame) > limits.maxRequestHeadBytes) {
      return `a request's URL, headers and secret placements can be at most ${limits.maxRequestHeadBytes} bytes together`;
    }
    return undefined;
  }

  /**
   * Answers a request with an error. A kit message can repeat what the
   * runner sent, so one too large for a frame is replaced by a fixed one.
   */
  #fail(id: number, failure: RequestFailure): void {
    try {
      this.#hooks.send({ type: "error", id, code: failure.code, message: failure.message });
    } catch (error) {
      if (!(error instanceof FrameTooLargeError)) throw error;
      this.#hooks.send({ type: "error", id, code: failure.code, message: messageTooLarge });
    }
  }

  /**
   * A request or a body piece that could not be answered. The runner would
   * wait for that answer forever, so it is stopped, and no failure is left
   * unhandled to end Halonic's process.
   */
  #broke(error: unknown): void {
    const what = error instanceof Error ? error.name : "an unknown error";
    this.#hooks.violation(`a request Halonic could not answer (${what})`);
  }

  #isLive(id: number, entry: TableRequest): boolean {
    return this.#live.get(id) === entry;
  }

  #close(id: number, entry: TableRequest): void {
    this.#live.delete(id);
    entry.abort.abort();
    if (entry.reader !== undefined) dropReader(entry.reader);
  }
}

/** The message sent in place of one too large for an `error` frame. */
const messageTooLarge = "the request was refused; the reason is too long to send";

const utf8 = new TextEncoder();

/** What each header and each placement adds on the wire: its `: ` and line end. */
const bytesPerEntry = 4;

/**
 * The UTF-8 size of a request's URL, header names and values, and secret
 * placements, with {@link bytesPerEntry} for each header and placement (section 3.3).
 */
function requestHeadBytes(frame: FetchFrame): number {
  const parts = [
    frame.url,
    ...frame.headers.flat(),
    ...frame.auth.flatMap((placement) => Object.values(placement)),
  ];
  const textBytes = parts.reduce((total, part) => total + utf8.encode(part).byteLength, 0);
  return textBytes + (frame.headers.length + frame.auth.length) * bytesPerEntry;
}

/** A placement from a frame, with an absent header prefix left out rather than `undefined`. */
function toPlacement(placement: FetchFrame["auth"][number]): SecretPlacement {
  if (placement.as !== "header" || placement.prefix !== undefined)
    return placement as SecretPlacement;
  return { secret: placement.secret, as: "header", header: placement.header };
}

/** Stops reading a body nobody will read. A failure to cancel leaves nothing to clean up. */
function dropBody(body: ReadableStream<Uint8Array> | null): void {
  body?.cancel().catch(() => undefined);
}

function dropReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  reader.cancel().catch(() => undefined);
}
