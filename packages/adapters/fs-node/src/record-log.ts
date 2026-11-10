import type { RecordChange } from "@halonicjs/ports";

/** A collection's log as read from disk: its changes, and how many of its bytes hold them. */
export interface RecordLog {
  changes: RecordChange[];
  /** The bytes up to and including the last line break. Anything after it is a torn line. */
  intactBytes: number;
}

const lineBreak = 0x0a;
const ops: ReadonlySet<string> = new Set(["add", "update", "remove", "seed"]);

/**
 * Reads a collection's log of one JSON change per line, each line ending in
 * a line break. A change counts only once its line break is written, so
 * whatever follows the last line break is a torn line from a crash, or an
 * append still being written, and is skipped. Every complete line must hold
 * a change to this collection: one for another collection means the file was
 * copied or renamed by hand.
 *
 * @param bytes - the log file's contents
 * @param collection - the collection the log belongs to
 * @param file - the log's path, for the error message
 * @throws Error naming the file and line when a complete line is broken
 */
export function parseRecordLog(bytes: Uint8Array, collection: string, file: string): RecordLog {
  const intactBytes = bytes.lastIndexOf(lineBreak) + 1;
  const text = decodeLines(bytes.subarray(0, intactBytes), file);
  const lines = text === "" ? [] : text.slice(0, -1).split("\n");
  const changes = lines.map((line, index) => parseLine(line, index + 1, collection, file));
  return { changes, intactBytes };
}

/** Writes changes as log lines, each ending in a line break. */
export function formatRecordLines(changes: readonly RecordChange[]): string {
  return changes.map((change) => `${JSON.stringify(change)}\n`).join("");
}

function decodeLines(bytes: Uint8Array, file: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error(`Broken record log ${JSON.stringify(file)}: it is not valid UTF-8 text.`);
  }
}

function parseLine(line: string, number: number, collection: string, file: string): RecordChange {
  const broken = (why: string): Error =>
    new Error(`Broken record log ${JSON.stringify(file)}, line ${number}: ${why}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw broken("it is not JSON.");
  }
  if (!isRecordChange(parsed)) {
    throw broken("it is not a record change.");
  }
  if (parsed.collection !== collection) {
    throw broken(`it holds a change to another collection, ${JSON.stringify(parsed.collection)}.`);
  }
  return parsed;
}

/** Whether a parsed line has the fields of a {@link RecordChange}, with the types the port gives them. */
function isRecordChange(value: unknown): value is RecordChange {
  if (!isObject(value)) {
    return false;
  }
  const { at, collection, id, op, values, by } = value;
  return (
    typeof at === "string" &&
    typeof collection === "string" &&
    typeof id === "string" &&
    typeof op === "string" &&
    ops.has(op) &&
    (values === null || isObject(values)) &&
    (by === undefined || isObject(by))
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
