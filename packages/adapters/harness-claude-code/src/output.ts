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
