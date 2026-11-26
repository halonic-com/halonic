import { createHash } from "node:crypto";
import { once } from "node:events";
import { type AddressInfo, createServer, type Server, type Socket } from "node:net";
import {
  encodeFrame,
  type FrameEvent,
  FrameReader,
  frameType,
} from "@halonicjs/adapter-websocket-frames";
import { company, testKey } from "./acme-data.test-helper.ts";
import { LiveEventsConnection, type LiveSignal } from "./live-events.ts";

/** How the fake answers an upgrade: a good `101`, no answer at all, or the raw answer it is given, one byte per character. */
export type FakeAnswer = "upgrade" | "hold" | string;

/**
 * A made-up Paperclip events socket on 127.0.0.1, written on raw `node:net` so a test controls every
 * byte: it records each request's head, answers it with `answer`, and after a `101` reads the client's
 * frames and hands the socket to `onOpen`.
 */
export class FakeEventsServer {
  readonly heads: string[] = [];
  /** Every byte that came before a request's head ended, as received. */
  readonly beforeHeads: Buffer[] = [];
  readonly frames: FrameEvent[] = [];
  answer: (head: string) => FakeAnswer = () => "upgrade";
  onOpen: (socket: Socket) => void = () => {};
  readonly #server: Server;
  readonly #sockets = new Set<Socket>();
  #frameWaiters: Array<() => void> = [];

  constructor() {
    this.#server = createServer((socket) => this.#accept(socket));
  }

  get address(): string {
    return `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
  }

  async start(): Promise<this> {
    this.#server.listen(0, "127.0.0.1");
    await once(this.#server, "listening");
    return this;
  }

  async stop(): Promise<void> {
    for (const socket of this.#sockets) socket.destroy();
    await new Promise<void>((resolve) => this.#server.close(() => resolve()));
  }

  /** Resolves once the client has sent at least `count` frames. */
  framesSent(count: number): Promise<FrameEvent[]> {
    return new Promise((resolve) => {
      const check = (): void => {
        if (this.frames.length >= count) resolve(this.frames);
        else this.#frameWaiters.push(check);
      };
      check();
    });
  }

  #accept(socket: Socket): void {
    this.#sockets.add(socket);
    socket.on("close", () => this.#sockets.delete(socket));
    let received = Buffer.alloc(0);
    const onHead = (chunk: Buffer): void => {
      this.beforeHeads.push(chunk);
      received = Buffer.concat([received, chunk]);
      const end = received.indexOf("\r\n\r\n");
      if (end < 0) return;
      socket.off("data", onHead);
      const head = received.subarray(0, end).toString("latin1");
      this.heads.push(head);
      this.#answer(socket, head);
    };
    socket.on("data", onHead);
  }

  #answer(socket: Socket, head: string): void {
    const answer = this.answer(head);
    if (answer === "hold") return;
    if (answer !== "upgrade") {
      socket.end(Buffer.from(answer, "latin1"));
      return;
    }
    socket.write(upgradeAnswer(head));
    const reader = new FrameReader(1024 * 1024, "client");
    socket.on("data", (chunk: Buffer) => {
      this.frames.push(...reader.push(chunk));
      const waiters = this.#frameWaiters;
      this.#frameWaiters = [];
      for (const waiter of waiters) waiter();
    });
    this.onOpen(socket);
  }
}

/** A good `101` answer to an upgrade request's `head`. */
export function upgradeAnswer(head: string, accept = acceptOf(head)): string {
  return [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    "",
  ].join("\r\n");
}

/** The accept value RFC 6455 asks for the key in `head`. */
function acceptOf(head: string): string {
  const key = /^sec-websocket-key: (.+)$/im.exec(head)?.[1] ?? "";
  return createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
}

/** A server's text frame holding `message` as JSON. */
export function textFrame(message: unknown): Buffer {
  return encodeFrame(frameType.text, Buffer.from(JSON.stringify(message)));
}

/** A connection to `server` for Acme's company, its signals so far, and waits for more of them. */
export interface TestConnection {
  connection: LiveEventsConnection;
  signals: LiveSignal[];
  /** The `closed` signal, once it comes. */
  closed: Promise<LiveSignal>;
  /** Resolves once at least `count` signals came. */
  signalsCame(count: number): Promise<LiveSignal[]>;
}

/** Makes a {@link TestConnection} to `server`. */
export function connectTo(
  server: FakeEventsServer,
  options: { idleTimeoutMs?: number; upgradeTimeoutMs?: number } = {},
): TestConnection {
  const signals: LiveSignal[] = [];
  let waiters: Array<() => void> = [];
  const signalsCame = (count: number): Promise<LiveSignal[]> =>
    new Promise((resolve) => {
      const check = (): void => {
        if (signals.length >= count) resolve(signals);
        else waiters.push(check);
      };
      check();
    });
  const connection = new LiveEventsConnection({
    address: server.address,
    key: testKey,
    company,
    ...options,
    onSignal: (signal) => {
      signals.push(signal);
      const waiting = waiters;
      waiters = [];
      for (const waiter of waiting) waiter();
    },
  });
  const closed = new Promise<LiveSignal>((resolve) => {
    const check = (): void => {
      const signal = signals.find((each) => each.kind === "closed");
      if (signal === undefined) waiters.push(check);
      else resolve(signal);
    };
    check();
  });
  return { connection, signals, closed, signalsCame };
}
