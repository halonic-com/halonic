/** The byte that ends a line. */
const lineFeed = 0x0a;

/**
 * Splits bytes read from srt's report pipe into lines, holding at most
 * `maxLineBytes` bytes at any time. A longer line is dropped whole, up to the
 * next line feed, and the lines after it are read as usual: a program that
 * can write to the pipe (on Windows) can neither grow the host's memory nor
 * stop the reports that follow. A line may end with `\n` or `\r\n`; neither
 * is part of it. Bytes that aren't UTF-8 become U+FFFD, which no report line
 * the parser accepts contains.
 */
export class ReportLines {
  readonly #maxLineBytes: number;
  readonly #onLine: (line: string) => void;
  readonly #decoder = new TextDecoder();
  /** The start of the line being read, copied out of the chunks it came in. */
  #held: Uint8Array[] = [];
  #heldBytes = 0;
  /** True while the rest of a line that is too long is being skipped. */
  #dropping = false;

  constructor(maxLineBytes: number, onLine: (line: string) => void) {
    this.#maxLineBytes = maxLineBytes;
    this.#onLine = onLine;
  }

  /** How many bytes of an unfinished line are held, never more than `maxLineBytes`. */
  get heldBytes(): number {
    return this.#heldBytes;
  }

  /** Takes the next bytes from the pipe and passes on each line they finish. */
  push(chunk: Uint8Array): void {
    let start = 0;
    while (start < chunk.length) {
      const end = chunk.indexOf(lineFeed, start);
      if (end === -1) {
        this.#hold(chunk.subarray(start));
        return;
      }
      this.#hold(chunk.subarray(start, end));
      this.#finishLine();
      start = end + 1;
    }
  }

  /** The pipe has ended: passes on a last line that had no line feed. */
  end(): void {
    if (this.#heldBytes > 0) this.#finishLine();
    this.#dropping = false;
  }

  #hold(piece: Uint8Array): void {
    if (this.#dropping || piece.length === 0) return;
    if (this.#heldBytes + piece.length > this.#maxLineBytes) {
      this.#dropping = true;
      this.#held = [];
      this.#heldBytes = 0;
      return;
    }
    // A copy, so a small piece doesn't keep the whole chunk it came in alive.
    this.#held.push(new Uint8Array(piece));
    this.#heldBytes += piece.length;
  }

  #finishLine(): void {
    const dropped = this.#dropping;
    const bytes = joinBytes(this.#held, this.#heldBytes);
    this.#held = [];
    this.#heldBytes = 0;
    this.#dropping = false;
    if (dropped) return;
    const line = this.#decoder.decode(bytes);
    this.#onLine(line.endsWith("\r") ? line.slice(0, -1) : line);
  }
}

function joinBytes(pieces: readonly Uint8Array[], length: number): Uint8Array {
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const piece of pieces) {
    joined.set(piece, offset);
    offset += piece.length;
  }
  return joined;
}
