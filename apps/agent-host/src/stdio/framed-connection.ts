import { Duplex } from "node:stream";
import { encodeFrame, FrameKind, maxFrameBytes } from "./frame-codec.ts";

/** Where a connection's frames go: the one frame stream all connections share. */
export interface FrameSink {
  /** Writes one frame; `done` runs once the stream took it, or with the reason it couldn't. */
  send(frame: Buffer, done?: (error?: Error | null) => void): void;
}

/**
 * The most bytes the relay may send on a connection the host isn't reading.
 * All connections share one input, so the host can't make the relay wait on
 * one of them; past this it resets the connection instead of holding more
 * in memory. As much as an answer may hold back (`maxUnsentBytes`).
 */
export const maxUnreadBytes = 4 * 1024 * 1024;

/**
 * One connection the relay opened, as the socket `node:http` reads and
 * writes. Its bytes travel as `data` frames, a half-close as `end` and a
 * drop as `reset`, in both directions.
 *
 * It has the few socket methods the server calls. `setTimeout` keeps time
 * for real, so the server's idle keep-alive limit still frees connections;
 * `setNoDelay` and `setKeepAlive` mean nothing without TCP, and do nothing.
 */
export class FramedConnection extends Duplex {
  /** The relay's id for this connection. */
  readonly id: number;
  private readonly sink: FrameSink;
  /** The peer reset the connection, so the host mustn't send `reset` back. */
  private resetByPeer = false;
  private idleTimer: NodeJS.Timeout | undefined;

  constructor(id: number, sink: FrameSink) {
    // Each side ends its own direction: the relay's `end` doesn't end the host's answer.
    super({ allowHalfOpen: true });
    this.id = id;
    this.sink = sink;
  }

  /** Hands the connection a frame the relay sent for it: `data`, `end` or `reset`. */
  receive(kind: FrameKind, bytes: Buffer): void {
    if (this.destroyed) return;
    this.idleTimer?.refresh();
    if (kind === FrameKind.reset) {
      this.resetByPeer = true;
      this.destroy();
    } else if (kind === FrameKind.end) {
      this.push(null);
    } else if (kind === FrameKind.data && !this.readableEnded) {
      this.push(bytes);
      if (this.readableLength > maxUnreadBytes) this.destroy();
    }
  }

  /** Runs `onTimeout` (and emits `timeout`) after `ms` without a frame either way; 0 turns it off. */
  setTimeout(ms: number, onTimeout?: () => void): this {
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    if (onTimeout !== undefined) this.once("timeout", onTimeout);
    if (ms > 0) {
      this.idleTimer = setTimeout(() => this.emit("timeout"), ms);
      this.idleTimer.unref();
    }
    return this;
  }

  setNoDelay(): this {
    return this;
  }

  setKeepAlive(): this {
    return this;
  }

  override _read(): void {
    // Frames arrive when the relay sends them; there is nothing to ask for.
  }

  override _write(chunk: Buffer, _encoding: BufferEncoding, done: (error?: Error | null) => void) {
    this.idleTimer?.refresh();
    if (chunk.length === 0) {
      done();
      return;
    }
    // Only the last frame reports back, so the next write waits for the whole chunk.
    for (let at = 0; at < chunk.length; at += maxFrameBytes) {
      const last = at + maxFrameBytes >= chunk.length;
      const frame = encodeFrame(this.id, FrameKind.data, chunk.subarray(at, at + maxFrameBytes));
      this.sink.send(frame, last ? done : undefined);
    }
  }

  override _final(done: (error?: Error | null) => void): void {
    this.sink.send(encodeFrame(this.id, FrameKind.end), done);
  }

  override _destroy(error: Error | null, done: (error?: Error | null) => void): void {
    clearTimeout(this.idleTimer);
    // Ending both ways cleanly is a close; anything else tells the relay to drop its side.
    const closedCleanly = this.readableEnded && this.writableFinished;
    if (!this.resetByPeer && !closedCleanly) this.sink.send(encodeFrame(this.id, FrameKind.reset));
    done(error);
  }
}
