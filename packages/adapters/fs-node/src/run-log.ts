import type { RunEvent } from "@halonicjs/events";
import { parseLogLines } from "@halonicjs/ports";

/** A run log as read from disk: its events, and how many of its bytes hold them. */
export interface RunLog {
  events: RunEvent[];
  /** The bytes up to and including the last line break. Anything after it is a torn line. */
  intactBytes: number;
  /** Whether bytes follow the last line break: a line a crash cut off. */
  torn: boolean;
}

const lineBreak = 0x0a;

/**
 * Reads a run log of one JSON event per line, each line ending in a line
 * break. An event counts only once its line break is written, so whatever
 * follows the last line break is a torn line from a crash and is skipped,
 * even when it happens to be valid JSON. The whole lines are read with the
 * port's `parseLogLines`, which the desktop app's store uses too.
 *
 * @param bytes - the log file's contents
 * @param runId - the run the log belongs to
 * @param file - the log's name, for the error message
 * @throws Error naming the file and line when a complete line is broken
 */
export function parseRunLog(bytes: Uint8Array, runId: string, file: string): RunLog {
  const intactBytes = bytes.lastIndexOf(lineBreak) + 1;
  const events = parseLogLines(decodeLines(bytes.subarray(0, intactBytes), file), runId, file);
  return { events, intactBytes, torn: intactBytes < bytes.length };
}

/** The whole lines of a log as text, or an error naming the file when they aren't UTF-8. */
function decodeLines(bytes: Uint8Array, file: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`Broken run log ${file}: it is not valid UTF-8 text.`);
  }
}
