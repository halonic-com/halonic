/** What {@link readLines} may be told. */
export interface ReadLinesOptions {
  /**
   * The longest line it accepts, in characters, line break not counted.
   * A longer line ends the reading with an error, so a program that prints
   * without ever ending a line can't fill Halonic's memory.
   */
  maxLineLength: number;
}

/**
 * Reads a program's output, such as a sandboxed process's `stdout`, as
 * UTF-8 text, one line at a time (requirement `harness-kit.read-lines`).
 *
 * A line ends with `\n` or `\r\n`; neither is part of the line. The last
 * line is read even without a line break, and an empty last line after the
 * final break is not. A UTF-8 character split across two chunks is put back
 * together; bytes that aren't UTF-8 become U+FFFD.
 *
 * When the caller stops early, or a line is too long, the stream is
 * cancelled: nothing else will read it.
 *
 * @throws Error when a line is longer than `maxLineLength`; the message doesn't quote it
 *
 * @example
 * for await (const line of readLines(process.stdout, { maxLineLength: 1_000_000 })) {
 *   handle(JSON.parse(line));
 * }
 */
export async function* readLines(
  stream: ReadableStream<Uint8Array>,
  options: ReadLinesOptions,
): AsyncGenerator<string, void, undefined> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let done = false;
  try {
    while (true) {
      const chunk = await reader.read();
      pending += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      let lineEnd = pending.indexOf("\n");
      while (lineEnd !== -1) {
        yield withoutCarriageReturn(checkedLength(pending.slice(0, lineEnd), options));
        pending = pending.slice(lineEnd + 1);
        lineEnd = pending.indexOf("\n");
      }
      checkedLength(pending, options);
      if (chunk.done) break;
    }
    if (pending !== "") yield withoutCarriageReturn(pending);
    done = true;
  } finally {
    if (done) reader.releaseLock();
    else await reader.cancel().catch(() => undefined);
  }
}

/** The line, or an error when it is longer than allowed. A `\r` before the break isn't counted. */
function checkedLength(line: string, { maxLineLength }: ReadLinesOptions): string {
  if (withoutCarriageReturn(line).length > maxLineLength) {
    throw new Error(`The program printed a line longer than ${maxLineLength} characters.`);
  }
  return line;
}

function withoutCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
