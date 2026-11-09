import { parseEventLine, type RunEvent } from "@halonicjs/events";

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
 * even when it happens to be valid JSON. Every complete line must hold the
 * run's next event.
 *
 * @param bytes - the log file's contents
 * @param runId - the run the log belongs to
 * @param file - the log's name, for the error message
 * @throws Error naming the file and line when a complete line is broken
 */
export function parseRunLog(bytes: Uint8Array, runId: string, file: string): RunLog {
  const intactBytes = bytes.lastIndexOf(lineBreak) + 1;
  const text = decodeLines(bytes.subarray(0, intactBytes), file);
  const lines = text === "" ? [] : text.slice(0, -1).split("\n");
  const events = lines.map((line, index) => parseLine(line, index + 1, runId, file));
  return { events, intactBytes, torn: intactBytes < bytes.length };
}

/** Writes events as log lines, each ending in a line break. */
export function formatLogLines(events: readonly RunEvent[]): string {
  return events.map((event) => `${JSON.stringify(event)}\n`).join("");
}

/** The whole lines of a log as text, or an error naming the file when they aren't UTF-8. */
function decodeLines(bytes: Uint8Array, file: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`Broken run log ${file}: it is not valid UTF-8 text.`);
  }
}

function parseLine(line: string, seq: number, runId: string, file: string): RunEvent {
  let event: RunEvent;
  try {
    event = parseEventLine(line);
  } catch (error) {
    throw new Error(`Broken run log ${file}, line ${seq}: ${(error as Error).message}`);
  }
  if (event.runId !== runId || event.seq !== seq) {
    throw new Error(
      `Broken run log ${file}, line ${seq}: it holds event ${event.seq} of run ${event.runId}.`,
    );
  }
  return event;
}
