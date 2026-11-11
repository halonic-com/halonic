// When a run started, read from its log's first line alone, so a list
// filtered by `startedSince` skips an older run without reading its log.

import type { FileHandle } from "node:fs/promises";
import { parseEventLine, type RunEvent } from "@halonicjs/events";
import { isMissing } from "./links.ts";
import { openUnlinkedForRead } from "./private-files.ts";

/** How much of the log one read takes while looking for the first line break. */
const chunkBytes = 4096;
const lineBreak = 0x0a;

/**
 * The time of the first event in the log at `file`, or `undefined` when it
 * can't be told from the first line: the log is missing, is a link, has no
 * whole first line yet, or the line is broken. The caller then reads the log whole, which
 * reports a broken log with its file and line.
 */
export async function readLogStart(file: string): Promise<string | undefined> {
  const line = await readFirstLine(file);
  return line === undefined ? undefined : parseFirstLine(line)?.at;
}

/**
 * The event on a log's first line (its bytes without the line break), or
 * `undefined` when the line is not valid UTF-8 or not an event. That is not
 * an answer either way: the whole read that follows names the fault.
 */
export function parseFirstLine(line: Uint8Array): RunEvent | undefined {
  try {
    return parseEventLine(new TextDecoder("utf-8", { fatal: true }).decode(line));
  } catch {
    return undefined;
  }
}

/** The bytes of the log's first line, without its line break, or `undefined` when it has none. */
async function readFirstLine(file: string): Promise<Uint8Array | undefined> {
  let handle: FileHandle;
  try {
    handle = await openUnlinkedForRead(file);
  } catch (error) {
    // A link, or not a plain file: the whole read that follows refuses it.
    if (isMissing(error) || error instanceof RangeError) return undefined;
    throw error;
  }
  try {
    const chunks: Uint8Array[] = [];
    for (let position = 0; ; ) {
      const chunk = new Uint8Array(chunkBytes);
      const { bytesRead } = await handle.read(chunk, 0, chunkBytes, position);
      if (bytesRead === 0) return undefined;
      const end = chunk.subarray(0, bytesRead).indexOf(lineBreak);
      if (end >= 0) {
        chunks.push(chunk.subarray(0, end));
        return Buffer.concat(chunks);
      }
      chunks.push(chunk.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
}
