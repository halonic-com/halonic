import { parseRecordLines, type RecordChange } from "@halonicjs/ports";

/** A collection's log as read from disk: its changes, and how many of its bytes hold them. */
export interface RecordLog {
  changes: RecordChange[];
  /** The bytes up to and including the last line break. Anything after it is a torn line. */
  intactBytes: number;
}

const lineBreak = 0x0a;

/**
 * Reads a collection's log of one JSON change per line, each line ending in
 * a line break. A change counts only once its line break is written, so
 * whatever follows the last line break is a torn line from a crash, or an
 * append still being written, and is skipped. The whole lines are read with
 * `parseRecordLines` from the ports, which the desktop app's store shares.
 *
 * @param bytes - the log file's contents
 * @param collection - the collection the log belongs to
 * @param file - the log's path, for the error message
 * @throws Error naming the file and line when a complete line is broken
 */
export function parseRecordLog(bytes: Uint8Array, collection: string, file: string): RecordLog {
  const intactBytes = bytes.lastIndexOf(lineBreak) + 1;
  const lines = decodeLines(bytes.subarray(0, intactBytes), file);
  return { changes: parseRecordLines(lines, collection, file), intactBytes };
}

function decodeLines(bytes: Uint8Array, file: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error(`Broken record log ${JSON.stringify(file)}: it is not valid UTF-8 text.`);
  }
}
