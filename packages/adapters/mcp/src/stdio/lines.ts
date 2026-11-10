import { McpError } from "../protocol/errors.ts";

const lineFeed = 0x0a;

/**
 * Splits a program's output into lines, as MCP's stdio transport frames
 * its messages. A line longer than `maxLineBytes` throws as soon as it is,
 * before it is all read, so a broken or hostile program can't fill memory.
 * A last line without its line feed is incomplete, so it is dropped.
 *
 * @throws {McpError} `unexpected-response` for a line above `maxLineBytes`
 */
export async function* readLines(
  chunks: AsyncIterable<Uint8Array>,
  maxLineBytes: number,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  for await (const chunk of chunks) {
    let start = 0;
    for (let end = chunk.indexOf(lineFeed); end !== -1; end = chunk.indexOf(lineFeed, start)) {
      const part = chunk.slice(start, end);
      checkLength(pendingBytes + part.length, maxLineBytes);
      yield decoder.decode(joined([...pending, part]));
      pending = [];
      pendingBytes = 0;
      start = end + 1;
    }
    const rest = chunk.slice(start);
    pendingBytes += rest.length;
    checkLength(pendingBytes, maxLineBytes);
    if (rest.length > 0) pending.push(rest);
  }
}

function checkLength(bytes: number, maxLineBytes: number): void {
  if (bytes > maxLineBytes) {
    throw new McpError(
      "unexpected-response",
      `The program sent a message larger than ${maxLineBytes} bytes.`,
    );
  }
}

function joined(parts: readonly Uint8Array[]): Uint8Array {
  const whole = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    whole.set(part, offset);
    offset += part.length;
  }
  return whole;
}
