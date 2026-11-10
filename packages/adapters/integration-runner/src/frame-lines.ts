// Newline-delimited JSON over a byte stream: one frame per line, each at
// most `maxFrameBytes` including its newline (design HAL-958, section 3.1).

import { maxFrameBytes } from "./frames.ts";

const newline = 0x0a;

/** Why a line could not be read as a frame. */
export type FrameLineProblem = "too-large" | "not-utf8" | "not-json" | "cut-off";

/** A line on the stream that is not a frame. The reader stops at the first one. */
export class FrameLineError extends Error {
  override readonly name = "FrameLineError";
  readonly problem: FrameLineProblem;

  constructor(problem: FrameLineProblem, message: string) {
    super(message);
    this.problem = problem;
  }
}

/**
 * Reads one JSON value per line. It throws a {@link FrameLineError} on a
 * line longer than the limit (without waiting for its end), on bytes that
 * aren't UTF-8, on a line that isn't JSON, and on a last line with no
 * newline. It never holds more than one frame's worth of bytes.
 *
 * @example
 * for await (const value of readFrameLines(process.stdout)) handle(value);
 */
export async function* readFrameLines(
  stream: ReadableStream<Uint8Array>,
  maxBytes = maxFrameBytes,
): AsyncGenerator<unknown> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  for await (const piece of stream) {
    let start = 0;
    for (let end = piece.indexOf(newline); end !== -1; end = piece.indexOf(newline, start)) {
      const tail = piece.subarray(start, end);
      if (pendingBytes + tail.byteLength + 1 > maxBytes) throw tooLarge(maxBytes);
      yield parseLine(decoder, joinBytes([...pending, tail], pendingBytes + tail.byteLength));
      pending = [];
      pendingBytes = 0;
      start = end + 1;
    }
    const rest = piece.subarray(start);
    // A frame needs room for its newline, so a line this long can't end in time.
    if (pendingBytes + rest.byteLength + 1 > maxBytes) throw tooLarge(maxBytes);
    if (rest.byteLength > 0) {
      pending.push(rest);
      pendingBytes += rest.byteLength;
    }
  }
  if (pendingBytes > 0) {
    throw new FrameLineError("cut-off", "the stream ended in the middle of a frame");
  }
}

/** One line, without its newline, as JSON. */
function parseLine(decoder: TextDecoder, bytes: Uint8Array): unknown {
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    throw new FrameLineError("not-utf8", "a frame is not valid UTF-8");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new FrameLineError("not-json", "a frame is not valid JSON");
  }
}

function tooLarge(maxBytes: number): FrameLineError {
  return new FrameLineError("too-large", `a frame is longer than ${maxBytes} bytes`);
}

function joinBytes(pieces: Uint8Array[], length: number): Uint8Array {
  if (pieces.length === 1) return pieces[0] as Uint8Array;
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const piece of pieces) {
    joined.set(piece, offset);
    offset += piece.byteLength;
  }
  return joined;
}

/** A frame that would be longer than the limit. It is never written. */
export class FrameTooLargeError extends Error {
  override readonly name = "FrameTooLargeError";
}

/**
 * Writes one JSON value per line, in the order `write` is called. It refuses
 * a frame longer than the limit before writing any of it, so the other side
 * never sees one.
 */
export class FrameLineWriter {
  readonly #writer: WritableStreamDefaultWriter<Uint8Array>;
  readonly #maxBytes: number;
  readonly #encoder = new TextEncoder();

  constructor(stream: WritableStream<Uint8Array>, maxBytes = maxFrameBytes) {
    this.#writer = stream.getWriter();
    this.#maxBytes = maxBytes;
  }

  /**
   * Encodes the frame as one line and queues it.
   *
   * @throws {FrameTooLargeError} when the line would be longer than the limit; nothing is written
   */
  write(frame: object): Promise<void> {
    const bytes = this.#encoder.encode(`${JSON.stringify(frame)}\n`);
    if (bytes.byteLength > this.#maxBytes) {
      throw new FrameTooLargeError(`a frame of ${bytes.byteLength} bytes is over the limit`);
    }
    return this.#writer.write(bytes);
  }

  /** Ends the stream after the frames already queued. Safe to call twice. */
  async close(): Promise<void> {
    try {
      await this.#writer.close();
    } catch {
      // Already closed or broken: the other side has gone, which is what close wants.
    }
  }
}
