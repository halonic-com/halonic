import {
  type EngineMessage,
  frameLengthBytes,
  maxEngineFrameBytes,
  maxShellFrameBytes,
} from "./control-messages.ts";

/**
 * A control pipe that breaks the protocol. The engine stops on one: after a
 * bad frame it can't trust the next. Its message never holds a frame's content.
 */
export class ControlPipeFault extends Error {
  override name = "ControlPipeFault";
}

/**
 * One message as a frame, ready to write.
 *
 * @throws RangeError when its JSON is longer than {@link maxEngineFrameBytes}, which the shell would refuse
 */
export function encodeControlFrame(message: EngineMessage): Buffer {
  const json = Buffer.from(JSON.stringify(message), "utf8");
  if (json.length > maxEngineFrameBytes) {
    throw new RangeError(`A control frame carries at most ${maxEngineFrameBytes} bytes.`);
  }
  const frame = Buffer.allocUnsafe(frameLengthBytes + json.length);
  frame.writeUInt32BE(json.length, 0);
  frame.set(json, frameLengthBytes);
  return frame;
}

const strictUtf8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Turns chunks of the shell's frame stream into parsed JSON values. Chunks
 * can split a frame anywhere, so it keeps the unfinished end until the rest
 * arrives, and it checks a frame's length before it waits for its bytes, so
 * it never holds more than one frame's cap.
 */
export class ControlFrameDecoder {
  private pending: Buffer = Buffer.alloc(0);

  /**
   * The values `chunk` completes, in order.
   *
   * @throws {ControlPipeFault} for a length of 0 or over {@link maxShellFrameBytes}, bad UTF-8 or bad JSON
   */
  push(chunk: Buffer): unknown[] {
    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);
    const values: unknown[] = [];
    let at = 0;
    while (this.pending.length - at >= frameLengthBytes) {
      const length = this.pending.readUInt32BE(at);
      if (length === 0 || length > maxShellFrameBytes) {
        throw new ControlPipeFault(`A control frame of ${length} bytes is refused.`);
      }
      if (this.pending.length - at < frameLengthBytes + length) break;
      const start = at + frameLengthBytes;
      values.push(parseJson(this.pending.subarray(start, start + length)));
      at = start + length;
    }
    // A copy, so the rest doesn't keep the whole chunk alive.
    this.pending = Buffer.from(this.pending.subarray(at));
    return values;
  }

  /** Whether part of a frame is still waiting for its rest. */
  get midFrame(): boolean {
    return this.pending.length > 0;
  }
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(strictUtf8.decode(bytes));
  } catch {
    // Not the cause: its message could quote the frame, which may hold a secret.
    throw new ControlPipeFault("A control frame isn't UTF-8 JSON.");
  }
}
