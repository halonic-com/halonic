// When a run started, read from its log's first line alone, so a list
// filtered by `startedSince` skips an older run without reading its log.

import { open } from "node:fs/promises";
import { parseEventLine } from "@halonicjs/events";
import { isMissing } from "./links.ts";

/** How much of the log one read takes while looking for the first line break. */
const chunkBytes = 4096;
const lineBreak = 0x0a;

/**
 * The time of the first event in the log at `file`, or `undefined` when it
 * can't be told from the first line: the log is missing, has no whole first
 * line yet, or the line is broken. The caller then reads the log whole, which
 * reports a broken log with its file and line.
 */
export async function readLogStart(file: string): Promise<string | undefined> {
  const line = await readFirstLine(file);
  if (line === undefined) return undefined;
  try {
    return parseEventLine(new TextDecoder("utf-8", { fatal: true }).decode(line)).at;
  } catch {
    // Not an answer either way: the whole read that follows names the fault.
    return undefined;
  }
}

/** The bytes of the log's first line, without its line break, or `undefined` when it has none. */
async function readFirstLine(file: string): Promise<Uint8Array | undefined> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(file, "r");
  } catch (error) {
    if (isMissing(error)) return undefined;
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
