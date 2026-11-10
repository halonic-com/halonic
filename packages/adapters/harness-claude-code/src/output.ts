import { readLines } from "@halonicjs/adapter-harness-kit";

/**
 * The longest line Halonic reads from Claude Code, in characters. A
 * stream-json line can carry a whole tool result, such as a file Claude Code
 * read, so the limit is generous; it only stops a program that never ends a
 * line.
 */
export const maxStreamJsonLineLength = 16 * 1024 * 1024;

/**
 * Claude Code's output, one stream-json line at a time, as
 * {@link readLines} reads it: without line breaks, characters split across
 * chunks put back together, and an error for a line longer than
 * {@link maxStreamJsonLineLength}. Stopping early cancels the output.
 */
export function streamJsonLines(output: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  return readLines(output, { maxLineLength: maxStreamJsonLineLength });
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
