import {
  parseEventLine,
  type RunEvent,
  type RunKind,
  type RunStatus,
  type RunSummary,
} from "@halonicjs/events";

/** Version of the {@link RunStore} port. A breaking change bumps it and comes with an ADR. */
export const runStoreVersion = 1;

/** Which runs {@link RunStore.list} returns. Every field narrows the list; none means all runs. */
export interface RunFilter {
  hubId?: string;
  workflowId?: string;
  kind?: RunKind;
  /**
   * One status or any of several, such as `["running", "waiting"]` for the
   * watchdog. An empty list is no status filter, the same as leaving it out.
   */
  status?: RunStatus | readonly RunStatus[];
  /**
   * An ISO time: only runs that started at or after it. A store that keeps
   * each run in its own log can then skip a log by its first line, so a
   * month's runs cost a read of that month's logs, not of every log.
   */
  startedSince?: string;
}

/**
 * What {@link RunStore.append} did. `lastSeq` is the sequence number of the
 * run's last stored event afterwards, so a writer that lost the race knows
 * where the log is now.
 *
 * A lost race is the error kind `conflict` from `@halonicjs/std`, so a surface
 * that reports it responds the same way as to any other conflict. The ports
 * may not import std (docs/adr/2026-11-09-api-types-stand-alone.md), so the
 * run-store contract in `@halonicjs/testing-contracts` checks that the two
 * stay the same.
 */
export type AppendResult =
  | { ok: true; lastSeq: number }
  | { ok: false; reason: "conflict"; lastSeq: number };

/** Options for {@link RunStore.append}. */
export interface AppendOptions {
  /**
   * The engine's state after these events, as plain JSON data, so the next
   * step starts from it instead of replaying the whole log. It is a cache:
   * an adapter may store the events and drop the snapshot, and `snapshot()`
   * then gives an older one or `null`.
   */
  snapshot?: unknown;
}

/** The latest state snapshot of a run, and the sequence number of the last event it includes. */
export interface RunSnapshot {
  seq: number;
  state: unknown;
}

/**
 * The append-only run event logs and the run list. The log is the truth and
 * the list is a copy of it, worked out with `summarize`
 * from `@halonicjs/events`.
 */
export interface RunStore {
  /**
   * Appends events to a run's log, but only if its last stored event is
   * `expectedSeq` (0 for a new run), so two writers can never both win.
   * The events are stored together or not at all: an append that fails or
   * gives a conflict stores none of them. Only a crash of the program in the
   * middle of an append may leave the first events stored, in an adapter
   * that writes to disk; its readme says so.
   *
   * @param runId - the run the events belong to; every event carries it too
   * @param expectedSeq - the sequence number of the last event the writer saw
   * @param events - at least one, numbered `expectedSeq + 1`, `expectedSeq + 2` …
   * @returns `ok: false` with reason "conflict" when the log has moved on
   * @throws RangeError when `events` is empty, misnumbered, or carries another
   *   run id, or `expectedSeq` isn't a whole number of 0 or more. These are the
   *   caller's bugs and are never reported as a conflict.
   */
  append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options?: AppendOptions,
  ): Promise<AppendResult>;
  /** A run's events, oldest first; with `afterSeq`, only those after it. Empty for an unknown run. */
  events(runId: string, afterSeq?: number): Promise<RunEvent[]>;
  /** The run's latest snapshot, or `null` when it has none or the run is unknown. */
  snapshot(runId: string): Promise<RunSnapshot | null>;
  /** A run's summary, or `null` for an unknown run. Always up to date with the log. */
  get(runId: string): Promise<RunSummary | null>;
  /**
   * The summaries of the runs that match the filter, newest start time first.
   * The list may lag the log for a short time (on Cloudflare it is filled
   * from an outbox); use {@link RunStore.get} when one run must be current.
   */
  list(filter?: RunFilter): Promise<RunSummary[]>;
}

/**
 * What a file-system adapter writes into `<runId>.lock`, next to the run's
 * log, while it appends to the run. The Node and Tauri adapters share this
 * format and these rules, so a CLI and a desktop app writing to one
 * workspace exclude each other, and one of them gets `conflict` instead of
 * both winning.
 *
 * - **Taking the lock:** create `<runId>.lock` with an exclusive create that
 *   fails when the file is already there (`wx` in Node, `create_new` in
 *   Rust), and write this record into it as JSON.
 * - **Appending:** with the lock held, read the log, return `conflict` when
 *   its last event isn't `expectedSeq`, otherwise write the events.
 * - **Releasing:** remove the lock file, but only while it still holds the
 *   record this writer wrote.
 * - **Waiting:** when the lock is held, try again a few milliseconds later.
 * - **Stale locks:** a crashed writer leaves its lock behind. Another writer
 *   may remove it when the lock's `host` is this computer and no process
 *   `pid` runs here any more, or when `takenAt` is more than
 *   {@link runLockStaleAfterMs} ago. The age limit also covers a process id
 *   that was reused, and a lock taken on another computer of a shared
 *   folder. A lock file that can't be read as a record (a crash between
 *   creating and writing it) counts its age from the file's change time.
 * - **Removing a stale lock:** only one writer removes a lock at a time,
 *   the one that creates `<runId>.lock.takeover` with an exclusive create.
 *   Holding it, the writer reads the lock again and removes it only while
 *   it still holds the same stale text, then removes the takeover file. A
 *   lock that isn't stale is never moved or removed. A writer that finds
 *   the takeover file there waits and tries again; one older than
 *   {@link runLockTakeoverStaleAfterMs} was left by a remover that crashed,
 *   and any writer may remove it.
 * - **A link at the lock's path:** when the exclusive create finds the file
 *   there but reading it finds none, and the path is a symbolic link to a
 *   file that isn't there, fail with an error instead of trying again.
 */
export interface RunLockRecord {
  /** The format version, {@link runLockFormat}. */
  version: number;
  /** The process id of the writer holding the lock. */
  pid: number;
  /** The host name of the computer the writer runs on. */
  host: string;
  /** When the lock was taken, as an ISO 8601 time in UTC. */
  takenAt: string;
}

/** The format version of {@link RunLockRecord} that adapters write today. */
export const runLockFormat = 1;

/**
 * How old a run lock may get before any writer may remove it. An append holds
 * the lock for milliseconds, so this is far longer than any append takes.
 */
export const runLockStaleAfterMs = 10_000;

/**
 * How old a lock's takeover file may get before any writer may remove it.
 * Removing a stale lock takes milliseconds, and up to 2 seconds a step on
 * Windows while a file is busy, so a takeover file this old was left by a
 * writer that crashed while removing a lock.
 */
export const runLockTakeoverStaleAfterMs = 5_000;

// The rules above, as code, so every adapter checks appends and filters runs the same way.

/**
 * Refuses an append that is the caller's bug, as {@link RunStore.append}
 * says: `expectedSeq` that isn't a whole number of 0 or more, no events,
 * an event of another run, or events not numbered from `expectedSeq + 1`.
 *
 * @throws RangeError naming what is wrong
 */
export function checkRunAppend(
  runId: string,
  expectedSeq: number,
  events: readonly RunEvent[],
): void {
  if (!Number.isSafeInteger(expectedSeq) || expectedSeq < 0) {
    throw new RangeError(`expectedSeq must be a whole number of 0 or more, not ${expectedSeq}.`);
  }
  if (events.length === 0) {
    throw new RangeError("append needs at least one event.");
  }
  events.forEach((event, index) => {
    if (event.runId !== runId) {
      throw new RangeError(`Event ${event.seq} belongs to run ${event.runId}, not ${runId}.`);
    }
    if (event.seq !== expectedSeq + index + 1) {
      throw new RangeError(`Event ${index} has seq ${event.seq}, not ${expectedSeq + index + 1}.`);
    }
  });
}

/** Whether a summary matches every field of a {@link RunFilter}. An empty status list is no status filter. */
export function matchesRunFilter(summary: RunSummary, filter: RunFilter): boolean {
  const statuses = filter.status === undefined ? [] : [filter.status].flat();
  return (
    (filter.hubId === undefined || summary.hubId === filter.hubId) &&
    (filter.workflowId === undefined || summary.workflowId === filter.workflowId) &&
    (filter.kind === undefined || summary.kind === filter.kind) &&
    (statuses.length === 0 || statuses.includes(summary.status)) &&
    (filter.startedSince === undefined || startedAtOrAfter(summary.startedAt, filter.startedSince))
  );
}

/**
 * Whether a run that started at `startedAt` is in a list filtered by
 * `startedSince`. Both are ISO times; they are compared as times, so an
 * offset or a missing fraction of a second doesn't change the answer.
 */
export function startedAtOrAfter(startedAt: string, since: string): boolean {
  return Date.parse(startedAt) >= Date.parse(since);
}

/** Orders summaries as {@link RunStore.list} returns them: newest start time first, then by run id. */
export function compareRunSummaries(a: RunSummary, b: RunSummary): number {
  return b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id);
}

// The run folder's file rules, which every adapter that keeps runs as files
// in a folder applies: the CLI's `FolderRunStore` in `fs-node` and the
// desktop app's store in `fs-tauri`, whose shell writes the same files. Bytes
// stay with the adapters: each finds the log's whole lines and decodes them
// its own way, then reads them here (HAL-2701).

/** Letters, digits, `_`, `-` and `.`, not starting with a dot, at most 128 characters: a safe file name everywhere. */
const runIdPattern = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/u;
/** Names Windows opens as a device whatever the extension, such as `NUL.jsonl`. */
const windowsDeviceName = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/iu;

/** Writes events as run log lines: one JSON event per line, each ending in a line break. */
export function formatLogLines(events: readonly RunEvent[]): string {
  return events.map((event) => `${JSON.stringify(event)}\n`).join("");
}

/**
 * Reads a run log's whole lines back into events. Every line must hold the
 * run's next event, numbered from 1. Pass only whole lines, each ending in
 * a line break: a torn last line, from a crash, is the adapter's to leave
 * out first.
 *
 * @param lines - the log's whole lines, or `""` for an empty log
 * @param runId - the run the log belongs to
 * @param file - the log's name, for the error message
 * @returns the events, in order
 * @throws Error naming the file and line when a line is broken
 */
export function parseLogLines(lines: string, runId: string, file: string): RunEvent[] {
  if (lines === "") {
    return [];
  }
  if (!lines.endsWith("\n")) {
    throw new RangeError(`Only whole lines of run log ${file} can be read.`);
  }
  return lines
    .slice(0, -1)
    .split("\n")
    .map((line, index) => parseLine(line, index + 1, runId, file));
}

/**
 * Whether a run id can be a plain file name in the run folder: 1 to 128
 * letters, digits, `_`, `-` or `.`, not starting with a dot, and not a name
 * Windows keeps for a device.
 */
export function isRunId(runId: string): boolean {
  return runIdPattern.test(runId) && !windowsDeviceName.test(runId);
}

/**
 * Refuses a run id that couldn't be a plain file name in the run folder:
 * `..`, a separator, an absolute path, a name Windows keeps for a device.
 *
 * @throws RangeError naming the run id
 */
export function checkRunId(runId: string): void {
  if (!isRunId(runId)) {
    throw new RangeError(
      `Unsafe run id ${JSON.stringify(runId)}: use 1 to 128 letters, digits, "_", "-" or ".", not starting with ".".`,
    );
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
