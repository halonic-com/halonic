// Halonic's table of the runner's requests and response bodies. Each `fetch`
// frame goes to the kit's client, which checks it exactly as in-process;
// the runner owns a body from its `head` until `end`, an error, or its own
// `cancel-body`, and reads it one `pull` at a time, so the kit's idle timer
// runs only while the integration waits (design HAL-958, section 3.7).

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
    let body: ReturnType<typeof decodeRequestBody>;
    try {
      body = decodeRequestBody(frame.body);
    } catch {
      this.#hooks.violation("a request body that is not base64");
      return;
    }
    const entry: TableRequest = { abort: new AbortController(), pulling: false };
    this.#live.set(frame.id, entry);
    void this.#send(frame, body, entry);
  }

  /** Takes a `pull` frame: answers with one `chunk`, the `end` or an `error`. */
  pull(id: number): void {
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
    void this.#readPiece(id, entry, entry.reader);
  }

  /** Takes a `cancel-body` frame: the integration stopped reading. */
  cancelBody(id: number): void {
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

  #fail(id: number, failure: RequestFailure): void {
    this.#hooks.send({ type: "error", id, code: failure.code, message: failure.message });
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
