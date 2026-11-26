import { randomBytes } from "node:crypto";
import type { Socket } from "node:net";
import {
  encodeFrame,
  type FrameEvent,
  FrameReader,
  frameType,
} from "@halonicjs/adapter-websocket-frames";
import { type LiveEvent, liveMessageOf } from "./live-messages.ts";
import { type UpgradedSocket, upgradeSocket, upgradeTimeoutMs } from "./live-socket.ts";
import {
  type PaperclipAnswer,
  PaperclipClientError,
  type PaperclipKeyGuard,
  PaperclipTransport,
} from "./transport.ts";

/** The largest frame the client reads; a larger one closes the connection before any of it is held. */
export const liveFrameMaxBytes = 1024 * 1024;

/** How long the socket may stay silent: Paperclip pings every 30 s, so this is 2.5 pings. */
export const liveIdleTimeoutMs = 75_000;

/**
 * Why the connection ended. `not-allowed` is Paperclip's 403 at the upgrade, which a board key
 * gets until Paperclip accepts board keys on the socket: not worth retrying until the key changes.
 */
export type LiveClosedWhy =
  | "stopped"
  | "closed"
  | "not-allowed"
  | "signed-out"
  | "refused"
  | "redirect"
  | "offline"
  | "bad-answer"
  | "too-large";

/** What the connection tells its owner, in order: `open` once, events and resyncs, `closed` once. */
export type LiveSignal =
  | { kind: "open" }
  | { kind: "event"; event: LiveEvent }
  | { kind: "resync" }
  /** `code` is the close code sent or received, or 1006 when no close frame was exchanged. */
  | { kind: "closed"; code: number; why: LiveClosedWhy };

/** One company's events socket: where it is, with which key, and who hears its signals. */
export interface LiveEventsOptions {
  address: string;
  /** The key, or the guard that hands it over; it goes only into the `Authorization` header. */
  key: string | PaperclipKeyGuard;
  company: string;
  onSignal: (signal: LiveSignal) => void;
  /** How long the upgrade may take; 10 s by default. */
  upgradeTimeoutMs?: number;
  /** How long an open socket may stay silent; {@link liveIdleTimeoutMs} by default. */
  idleTimeoutMs?: number;
}

/** The messages that ask for status events only: `runIds` stays empty, so no run log is ever sent. */
const helloMessages = [
  { type: "live.hello", version: 1 },
  { type: "live.interests", version: 1, revision: 1, runIds: [] },
];

const thrownWhy: Readonly<Record<PaperclipClientError["reason"], LiveClosedWhy>> = {
  redirect: "redirect",
  "bad-answer": "bad-answer",
  "bad-key": "refused",
  refused: "refused",
  offline: "offline",
  "signed-out": "signed-out",
  "not-found": "refused",
  conflict: "refused",
};

/**
 * Paperclip's live events for one company, over our own WebSocket client
 * (`paperclip-client.live-events`). It opens once: the owner makes a new one
 * to reconnect. It follows the client's key rules (the key only in the
 * `Authorization` header, `wss` or loopback `ws`, no redirect) and closes on a
 * frame over 1 MB, a binary frame, or one that breaks the format.
 */
export class LiveEventsConnection {
  readonly #transport: PaperclipTransport;
  readonly #company: string;
  readonly #onSignal: (signal: LiveSignal) => void;
  readonly #upgradeTimeoutMs: number;
  readonly #idleTimeoutMs: number;
  #socket: Socket | undefined;
  #started = false;
  #ended = false;

  constructor(options: LiveEventsOptions) {
    this.#transport = new PaperclipTransport({ address: options.address, key: options.key });
    this.#company = options.company;
    this.#onSignal = options.onSignal;
    this.#upgradeTimeoutMs = options.upgradeTimeoutMs ?? upgradeTimeoutMs;
    this.#idleTimeoutMs = options.idleTimeoutMs ?? liveIdleTimeoutMs;
  }

  /** Connects; it resolves once the connection has said `open` or `closed`. */
  async open(): Promise<void> {
    if (this.#started) throw new Error("A live events connection opens once; make a new one.");
    this.#started = true;
    let answer: PaperclipAnswer;
    try {
      answer = await this.#transport.openSocket(
        "liveEvents",
        { company: this.#company },
        (url, authorization) =>
          upgradeSocket(
            url,
            authorization,
            (upgraded) => this.#attach(upgraded),
            this.#upgradeTimeoutMs,
          ),
      );
    } catch (error) {
      if (!(error instanceof PaperclipClientError)) throw error;
      this.#end(1006, thrownWhy[error.reason]);
      return;
    }
    if (answer.kind === "failed") this.#end(1006, failedWhy(answer));
  }

  /** Closes the connection with a normal close; the owner hears `closed` with `stopped`. */
  close(): void {
    if (this.#socket === undefined) this.#end(1000, "stopped");
    else this.#closeWith(1000, "stopped");
  }

  #attach({ socket, rest }: UpgradedSocket): void {
    if (this.#ended) {
      socket.destroy();
      return;
    }
    this.#socket = socket;
    const reader = new FrameReader(liveFrameMaxBytes, "server");
    socket.setTimeout(this.#idleTimeoutMs, () => socket.destroy());
    socket.on("data", (chunk: Buffer) => this.#read(reader.push(chunk)));
    socket.on("close", () => this.#end(1006, "closed"));
    socket.resume();
    for (const message of helloMessages) this.#send(frameType.text, JSON.stringify(message));
    this.#onSignal({ kind: "open" });
    if (rest.length > 0) this.#read(reader.push(rest));
  }

  #read(events: readonly FrameEvent[]): void {
    for (const event of events) {
      if (this.#ended) return;
      this.#readOne(event);
    }
  }

  #readOne(event: FrameEvent): void {
    switch (event.kind) {
      case "message":
        this.#readMessage(event.binary, event.bytes);
        return;
      case "ping":
        this.#send(frameType.pong, event.bytes);
        return;
      case "pong":
        return;
      case "close":
        this.#closeWith(closeCodeOf(event.bytes), "closed");
        return;
      case "too-large":
        this.#closeWith(1009, "too-large");
        return;
      default:
        this.#closeWith(1002, "bad-answer");
    }
  }

  #readMessage(binary: boolean, bytes: Uint8Array): void {
    if (binary) {
      this.#closeWith(1003, "bad-answer");
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      this.#closeWith(1007, "bad-answer");
      return;
    }
    const message = liveMessageOf(body, this.#company);
    if (message !== undefined) this.#onSignal(message);
  }

  #send(opcode: number, payload: string | Uint8Array): void {
    const bytes = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
    this.#socket?.write(encodeFrame(opcode, bytes, randomBytes(4)));
  }

  /** Sends a close frame with `code` (none for 1005, which no frame may carry), ends the socket and tells the owner. */
  #closeWith(code: number, why: LiveClosedWhy): void {
    if (this.#ended) return;
    const payload =
      code === noStatusCode ? new Uint8Array(0) : Uint8Array.of(code >> 8, code & 0xff);
    this.#send(frameType.close, payload);
    this.#end(code, why);
    this.#socket?.end();
  }

  #end(code: number, why: LiveClosedWhy): void {
    if (this.#ended) return;
    this.#ended = true;
    this.#onSignal({ kind: "closed", code, why });
  }
}

/** The close code for a close frame that carries none (RFC 6455, 7.1.5). */
const noStatusCode = 1005;

/** The status code of a server's close frame, or 1005 when it has none. */
function closeCodeOf(bytes: Uint8Array): number {
  return bytes.length < 2 ? noStatusCode : ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
}

/** Why a failed upgrade ended the connection: a 403 means the key may not use the socket. */
function failedWhy(answer: Extract<PaperclipAnswer, { kind: "failed" }>): LiveClosedWhy {
  if (answer.failure === "offline" || answer.failure === "signed-out") return answer.failure;
  return answer.status === 403 ? "not-allowed" : "refused";
}
