/**
 * The lines of a program's output, without their line breaks (`\n` or
 * `\r\n`). A last line without a line break counts too. A character split
 * across two chunks stays whole.
 */
export async function* outputLines(output: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  // A reader that stops early leaves the output to the program's end:
  // the run stops the program, which ends its output.
  for await (const chunk of output.values({ preventCancel: true })) {
    buffer += decoder.decode(chunk, { stream: true });
    let end = buffer.indexOf("\n");
    while (end !== -1) {
      yield withoutCarriageReturn(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      end = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  if (buffer !== "") yield withoutCarriageReturn(buffer);
}

function withoutCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/**
 * Reads a program's output to its end and keeps only the last
 * `keptCharacters` of it, so a program that prints a lot can't fill the
 * memory. Reading it to the end also keeps the program from stalling on a
 * full pipe.
 */
export async function outputTail(
  output: ReadableStream<Uint8Array>,
  keptCharacters: number,
): Promise<string> {
  const decoder = new TextDecoder();
  let tail = "";
  for await (const chunk of output) {
    tail = (tail + decoder.decode(chunk, { stream: true })).slice(-keptCharacters);
  }
  return (tail + decoder.decode()).slice(-keptCharacters);
}
