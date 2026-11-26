import { findCredentialShape } from "./credential-shape.ts";

/**
 * The run log, turned into the safe steps a progress note may be written from
 * (HAL-19218, the notes design on HAL-18743 section 5 with Julian's log rules).
 * Pure and fail-closed:
 * - only `acpx.tool_call` records are read, and of those only the tool's kind,
 *   its status and, for a command, its program and subcommand when both are
 *   plain words on a fixed list; anything else is "Ran a command";
 * - a tool's output (the text of a `completed` record) is never read;
 * - thinking and the agent's own text (`acpx.text_delta`) are never read, until
 *   Julian clears thinking (HAL-18569);
 * - a line that doesn't parse is skipped, never quoted.
 * The raw log is read in memory only: nothing here keeps or returns its text.
 */

/** Where a step stands, from the record's `status` field alone. */
export type StepStatus = "running" | "passed" | "failed";

/** One step of the run, as the note's prompt and its check see it. */
export interface SafeStep {
  /** A fixed label, such as "Read a file" or "Ran git push". */
  readonly label: string;
  readonly status: StepStatus;
}

/** Labels for the tool kinds ACPX reports; any other kind is {@link otherTool}. */
const toolLabels: Readonly<Record<string, string>> = {
  Terminal: "Ran a command",
  "Read File": "Read a file",
  Read: "Read a file",
  Edit: "Edited a file",
  "Edit File": "Edited a file",
  Write: "Edited a file",
  "Write File": "Edited a file",
  Search: "Searched the code",
  Grep: "Searched the code",
  Glob: "Searched the code",
  Find: "Searched the code",
  Fetch: "Read a web page",
  WebFetch: "Read a web page",
  WebSearch: "Searched the web",
};

const otherTool = "Used a tool";

/** Programs a command label may name; a command run with any other program stays "Ran a command". */
const namedPrograms = new Set([
  "git",
  "gh",
  "pnpm",
  "npm",
  "npx",
  "node",
  "vitest",
  "tsc",
  "biome",
  "cargo",
  "python3",
  "ls",
  "grep",
  "rg",
  "curl",
  "jq",
]);

/** A program or subcommand word: lowercase letters, digits and inner dashes or colons only. */
const plainWord = /^[a-z][a-z0-9:-]{0,30}$/;

/**
 * "Ran <program> <subcommand>" when the command starts with a listed program
 * and a plain subcommand word, "Ran <program>" with no plain second word, else
 * undefined. Never more than those two words: arguments can hold anything.
 */
export function commandLabel(command: string): string | undefined {
  const [program, subcommand] = command.trim().split(/\s+/);
  if (program === undefined || !namedPrograms.has(program)) {
    return undefined;
  }
  const label =
    subcommand !== undefined && plainWord.test(subcommand)
      ? `Ran ${program} ${subcommand}`
      : `Ran ${program}`;
  return findCredentialShape(label) === undefined ? label : undefined;
}

function statusOf(value: unknown): StepStatus | undefined {
  if (value === "completed") return "passed";
  if (value === "failed") return "failed";
  if (value === "pending" || value === "in_progress") return "running";
  return undefined;
}

/** One tool call as the reader tracks it, by its id. */
interface TrackedCall {
  label: string;
  status: StepStatus;
  /** Whether the call has a command label yet; a command's title arrives in a later record. */
  named: boolean;
}

/** The run's tool calls so far, in order, and how many changes are new since the last note. */
export interface StepLog {
  readonly calls: ReadonlyMap<string, TrackedCall>;
  /** Ids of the calls that started or changed since the last note, in order. */
  readonly changed: readonly string[];
}

export const emptyStepLog: StepLog = { calls: new Map(), changed: [] };

/** The ACPX record inside one log line's chunk, when it is one the reader may use. */
interface ToolCallRecord {
  readonly toolCallId: string;
  readonly name: string | undefined;
  readonly status: StepStatus | undefined;
}

/** The tool call records in one log line: `{ stream, chunk }`, the chunk holding ndjson. */
function toolCallRecords(line: string): ToolCallRecord[] {
  let chunk: unknown;
  try {
    chunk = (JSON.parse(line) as { chunk?: unknown }).chunk;
  } catch {
    return [];
  }
  if (typeof chunk !== "string") {
    return [];
  }
  const records: ToolCallRecord[] = [];
  for (const part of chunk.split("\n")) {
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(part) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (record["type"] !== "acpx.tool_call" || typeof record["toolCallId"] !== "string") {
      continue;
    }
    // Only `name` and `status` are read: `text` holds the tool's output.
    const name = typeof record["name"] === "string" ? record["name"] : undefined;
    records.push({ toolCallId: record["toolCallId"], name, status: statusOf(record["status"]) });
  }
  return records;
}

/** The call after one more record: a new kind sets the label, a command title names it, a status moves it. */
function updated(call: TrackedCall | undefined, record: ToolCallRecord): TrackedCall {
  const next: TrackedCall =
    call === undefined ? { label: otherTool, status: "running", named: false } : { ...call };
  const { name } = record;
  if (name !== undefined && call === undefined) {
    next.label = toolLabels[name] ?? otherTool;
  } else if (name !== undefined && next.label === toolLabels["Terminal"] && !next.named) {
    const label = commandLabel(name);
    next.named = label !== undefined || name !== "Terminal";
    next.label = label ?? next.label;
  }
  if (record.status !== undefined) {
    next.status = record.status;
  }
  return next;
}

/** The step log after more complete log lines. */
export function readSteps(log: StepLog, lines: readonly string[]): StepLog {
  const calls = new Map(log.calls);
  const changed = [...log.changed];
  for (const line of lines) {
    for (const record of toolCallRecords(line)) {
      const before = calls.get(record.toolCallId);
      const after = updated(before, record);
      if (before?.label !== after.label || before.status !== after.status) {
        calls.set(record.toolCallId, after);
        if (!changed.includes(record.toolCallId)) changed.push(record.toolCallId);
      }
    }
  }
  return { calls, changed };
}

/** How many new steps a note's prompt gets at most; the newest are kept. */
export const maxStepsPerNote = 20;

/** The steps that are new since the last note, newest last. */
export function newSteps(log: StepLog): SafeStep[] {
  return log.changed
    .flatMap((id) => {
      const call = log.calls.get(id);
      return call === undefined ? [] : [{ label: call.label, status: call.status }];
    })
    .slice(-maxStepsPerNote);
}

/** The step log once a note was written: nothing new. */
export function noteTaken(log: StepLog): StepLog {
  return { calls: log.calls, changed: [] };
}

/**
 * Where the reader is in the log: the byte offset it reads from next, and
 * whether it is skipping the rest of a line too long to read whole.
 */
export interface LogCursor {
  readonly offset: number;
  readonly skipping: boolean;
}

export const startCursor: LogCursor = { offset: 0, skipping: false };

/**
 * The complete lines in one read from `cursor`, and where to read next. A
 * line cut off by the read's end is read again next time. When a read filled
 * its whole limit without ending a line (a big tool output), that line is
 * skipped to its end, never parsed in part.
 */
export function completeLines(
  cursor: LogCursor,
  content: string,
  readWasFull: boolean,
): { readonly lines: string[]; readonly cursor: LogCursor } {
  const bytes = (text: string) => Buffer.byteLength(text, "utf8");
  let rest = content;
  let offset = cursor.offset;
  if (cursor.skipping) {
    const end = rest.indexOf("\n");
    if (end === -1) {
      return { lines: [], cursor: { offset: offset + bytes(rest), skipping: true } };
    }
    offset += bytes(rest.slice(0, end + 1));
    rest = rest.slice(end + 1);
  }
  const lastEnd = rest.lastIndexOf("\n");
  if (lastEnd === -1) {
    const tooLong = readWasFull && rest === content;
    return {
      lines: [],
      cursor: tooLong
        ? { offset: offset + bytes(rest), skipping: true }
        : { offset, skipping: false },
    };
  }
  const whole = rest.slice(0, lastEnd + 1);
  const lines = whole.split("\n").filter((line) => line.trim() !== "");
  return { lines, cursor: { offset: offset + bytes(whole), skipping: false } };
}
