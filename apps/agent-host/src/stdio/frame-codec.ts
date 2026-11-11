/**
 * The frames the host and Studio's relay exchange over standard input and
 * output in `--stdio` mode (HAL-6104). Each frame belongs to one connection:
 *
 *   [connection id: u32 big-endian][kind: u8][length: u32 big-endian][bytes]
 *
 * The relay opens connections and picks their ids; either side can end or
 * reset one.
 */

/** What a frame does to its connection. */
export const FrameKind = {
  /** The relay accepted a connection with this id. No bytes. */
  open: 1,
  /** Bytes of the connection, in order. */
  data: 2,
  /** The sender won't send more on this connection (a half-close). No bytes. */
  end: 3,
  /** The sender dropped the connection: nothing more goes either way. No bytes. */
  reset: 4,
} as const;

export type FrameKind = (typeof FrameKind)[keyof typeof FrameKind];

/** One frame, decoded. */
export interface Frame {
  connection: number;
  kind: FrameKind;
  bytes: Buffer;
}

/** The most bytes one frame carries; a longer write is split. */
export const maxFrameBytes = 64 * 1024;

/** id (4) + kind (1) + length (4). */
const headerBytes = 9;

const knownKinds: ReadonlySet<number> = new Set(Object.values(FrameKind));

/** A frame stream that breaks the format. The host stops on one: it can't find the next frame. */
export class FrameStreamError extends Error {
  override name = "FrameStreamError";
}

/** One frame as bytes, ready to write. */
export function encodeFrame(connection: number, kind: FrameKind, bytes?: Uint8Array): Buffer {
  const length = bytes?.byteLength ?? 0;
  if (length > maxFrameBytes) {
    throw new RangeError(`A frame carries at most ${maxFrameBytes} bytes, not ${length}.`);
  }
  const frame = Buffer.allocUnsafe(headerBytes + length);
  frame.writeUInt32BE(connection, 0);
  frame.writeUInt8(kind, 4);
  frame.writeUInt32BE(length, 5);
  if (bytes !== undefined) frame.set(bytes, headerBytes);
  return frame;
}

/**
 * Turns chunks of a frame stream into frames. Chunks can split a frame
 * anywhere, so it keeps the unfinished end until the rest arrives.
 */
export class FrameDecoder {
  private pending: Buffer = Buffer.alloc(0);

  /**
   * The frames `chunk` completes, in order.
   *
   * @throws {FrameStreamError} for an unknown kind, or a length over {@link maxFrameBytes}
   */
  push(chunk: Buffer): Frame[] {
    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);
    const frames: Frame[] = [];
    let at = 0;
    while (this.pending.length - at >= headerBytes) {
      const kind = this.pending.readUInt8(at + 4);
      const length = this.pending.readUInt32BE(at + 5);
      if (!knownKinds.has(kind)) throw new FrameStreamError(`Unknown frame kind ${kind}.`);
      if (length > maxFrameBytes) {
        throw new FrameStreamError(`A frame of ${length} bytes is too long.`);
      }
      if (this.pending.length - at < headerBytes + length) break;
      frames.push({
        connection: this.pending.readUInt32BE(at),
        kind: kind as FrameKind,
        // A copy, so a frame doesn't keep the whole chunk alive.
        bytes: Buffer.from(this.pending.subarray(at + headerBytes, at + headerBytes + length)),
      });
      at += headerBytes + length;
    }
    this.pending = this.pending.subarray(at);
    return frames;
  }

  /** Whether part of a frame is still waiting for its rest. */
  get midFrame(): boolean {
    return this.pending.length > 0;
  }
}
