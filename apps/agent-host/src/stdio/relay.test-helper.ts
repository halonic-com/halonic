import { request } from "node:http";
import { PassThrough } from "node:stream";
import { encodeFrame, type Frame, FrameDecoder, FrameKind } from "./frame-codec.ts";
import type { FrameStreams } from "./frame-demuxer.ts";
import { FramedConnection } from "./framed-connection.ts";

/** An answer the relay read back, with its body as text. */
export interface RelayedAnswer {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/**
 * A stand-in for Studio's relay: it opens connections to the host as frames
 * over a pair of in-memory streams, the host's input and output. It uses
 * the host's own `FramedConnection` for its side, so `node:http`'s client
 * runs over it as it would over a socket.
 */
export class TestRelay {
  /** The host's ends: what it reads, and where it writes. */
  readonly streams = { input: new PassThrough(), output: new PassThrough() } satisfies FrameStreams;
  /** Every frame the host sent, in order. */
  readonly received: Frame[] = [];
  /** The handshake line the host printed before the frames, once it has; see the constructor. */
  handshake: string | undefined;
  private readonly connections = new Map<number, FramedConnection>();
  private lastId = 0;

  /** @param withHandshake - whether the host prints a handshake line before the frames, as `--stdio` does */
  constructor(withHandshake = false) {
    const decoder = new FrameDecoder();
    let beforeFrames = withHandshake ? Buffer.alloc(0) : undefined;
    this.streams.output.on("data", (chunk: Buffer) => {
      let frames = chunk;
      if (beforeFrames !== undefined) {
        beforeFrames = Buffer.concat([beforeFrames, chunk]);
        const lineEnd = beforeFrames.indexOf("\n");
        if (lineEnd === -1) return;
        this.handshake = beforeFrames.subarray(0, lineEnd).toString("utf8");
        frames = beforeFrames.subarray(lineEnd + 1);
        beforeFrames = undefined;
      }
      for (const frame of decoder.push(frames)) {
        this.received.push(frame);
        this.connections.get(frame.connection)?.receive(frame.kind, frame.bytes);
      }
    });
  }

  /** Resolves with the handshake line once the host has printed it. */
  async handshakeLine(): Promise<string> {
    while (this.handshake === undefined) {
      await new Promise((resolve) => this.streams.output.once("data", resolve));
    }
    return this.handshake;
  }

  /** Sends raw bytes to the host, frames or not. */
  send(bytes: Buffer): void {
    this.streams.input.write(bytes);
  }

  /** Sends one frame to the host. */
  sendFrame(connection: number, kind: FrameKind, bytes?: Uint8Array): void {
    this.send(encodeFrame(connection, kind, bytes));
  }

  /** Opens a connection with the next id, as the relay does when Windows accepts one. */
  connect(): FramedConnection {
    this.lastId += 1;
    const id = this.lastId;
    const sink = {
      send: (frame: Buffer, done?: (error?: Error | null) => void) =>
        this.streams.input.write(frame, done),
    };
    const connection = new FramedConnection(id, sink);
    this.connections.set(id, connection);
    connection.once("close", () => this.connections.delete(id));
    this.sendFrame(id, FrameKind.open);
    return connection;
  }

  /** Sends one HTTP request on a new connection and reads the whole answer. */
  request(
    path: string,
    options: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ): Promise<RelayedAnswer> {
    return new Promise((resolve, reject) => {
      const sent = request(
        {
          path,
          method: options.method ?? "GET",
          headers: options.headers,
          createConnection: () => this.connect(),
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      sent.on("error", reject);
      sent.end(options.body);
    });
  }

  /** Resolves once the host has sent a frame that matches. */
  async frameWhere(matches: (frame: Frame) => boolean): Promise<Frame> {
    for (;;) {
      const found = this.received.find(matches);
      if (found !== undefined) return found;
      await new Promise((resolve) => this.streams.output.once("data", resolve));
    }
  }
}
