import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  truncate,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { type RunEvent, type RunSummary, summarize } from "@halonicjs/events";
import {
  type AppendOptions,
  type AppendResult,
  checkRunAppend,
  checkRunId,
  compareRunSummaries,
  formatLogLines,
  isRunId,
  matchesRunFilter,
  type RunFilter,
  type RunSnapshot,
  type RunStore,
  startedAtOrAfter,
} from "@halonicjs/ports";
import { KeyedQueue, KindedError } from "@halonicjs/std";
import { isMissing } from "./links.ts";
import { renameOver } from "./rename-over.ts";
import { type LockedOutcome, settleUnderRunLock } from "./run-lock.ts";
import { isLogOfOtherCase, parseRunLog, type RunLog } from "./run-log.ts";
import { readLogStart } from "./run-log-start.ts";

const logSuffix = ".jsonl";
const snapshotSuffix = ".snapshot.json";
const lockSuffix = ".lock";

/** Settings for a {@link FolderRunStore}. */
export interface FolderRunStoreOptions {
  /**
   * Called when an append stored its events but couldn't write the
   * snapshot. The append still succeeds, since the snapshot is only a
   * cache, so this is the one place the failure shows; log it as a warning.
   * It must not throw, or the append rejects although its events are stored.
   */
  onSnapshotError?: (runId: string, error: unknown) => void;
  /**
   * Called when an append stored its events but couldn't remove the run's
   * lock afterwards. The append still succeeds; later appends to the run,
   * this store's included, wait until the lock left behind is older than
   * `runLockStaleAfterMs`.
   * Log it as a warning. It must not throw, or the append rejects although
   * its events are stored.
   */
  onLockReleaseError?: (runId: string, error: unknown) => void;
}

/** Where a run's log ends, as this store last read or wrote it. */
interface LogEnd {
  /** The seq of the log's last event, 0 for an empty log. */
  lastSeq: number;
  /** The log's size in bytes, which ends in a line break. */
  bytes: number;
}

/**
 * Run logs as files in one folder: `<runId>.jsonl` holds the run's events,
 * one per line, and only ever grows; `<runId>.snapshot.json` caches the
 * engine's state and may be deleted at any time. The list is worked out
 * from the logs on every call, so deleting a log removes the run. A list
 * filtered by `startedSince` reads only the first line of an older run's log.
 *
 * Appends and reads of one run go one at a time, so a reader in this
 * process never sees an append that is still being written or cut back.
 * Appends also go one at a time across processes: each holds `<runId>.lock`
 * while it checks `expectedSeq` and writes, following the port's
 * `RunLockRecord` rules, so a CLI and a desktop app on one folder can't both
 * win. An append that fails stores nothing, but one cut off by a crash of
 * the program may leave the first events of its batch stored.
 */
export class FolderRunStore implements RunStore {
  readonly #root: string;
  readonly #onSnapshotError: (runId: string, error: unknown) => void;
  readonly #onLockReleaseError: (runId: string, error: unknown) => void;
  readonly #queue = new KeyedQueue();
  /**
   * Where each log ended after this store's last append to it, so the next
   * append needn't read the whole log again. An entry counts only while the
   * file still has that size; any other size means someone else changed or
   * deleted the log, and it is read again.
   */
  readonly #logEnds = new Map<string, LogEnd>();

  /**
   * @param root - the folder for the run files; created on the first append
   * @param options - hooks for snapshots that couldn't be written and locks that couldn't be removed
   */
  constructor(root: string, options: FolderRunStoreOptions = {}) {
    this.#root = resolve(root);
    this.#onSnapshotError = options.onSnapshotError ?? (() => {});
    this.#onLockReleaseError = options.onLockReleaseError ?? (() => {});
  }

  async append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options: AppendOptions = {},
  ): Promise<AppendResult> {
    checkRunId(runId);
    checkRunAppend(runId, expectedSeq, events);
    const lastSeq = expectedSeq + events.length;
    // Written to text first, so data JSON can't hold fails before anything is stored.
    const lines = formatLogLines(events);
    const snapshot =
      options.snapshot === undefined
        ? undefined
        : JSON.stringify({ seq: lastSeq, state: options.snapshot } satisfies RunSnapshot);
    return await this.#queue.run(runId, async () => {
      await mkdir(this.#root, { recursive: true });
      const outcome = await settleUnderRunLock(this.#file(runId, lockSuffix), () =>
        this.#appendLocked(runId, expectedSeq, lastSeq, lines, snapshot),
      );
      return this.#afterRelease(runId, outcome);
    });
  }

  /**
   * The append's answer once the lock is let go. When the lock couldn't be
   * released but the events are stored, the append still succeeds: failing
   * it would make the caller retry and conflict with its own events, as the
   * Studio shell's run store also avoids. A conflict stored nothing, so
   * there the release error is the answer.
   */
  #afterRelease(runId: string, outcome: LockedOutcome<AppendResult>): AppendResult {
    if (outcome.released) {
      return outcome.result;
    }
    if (!outcome.result.ok) {
      throw outcome.releaseError;
    }
    this.#onLockReleaseError(runId, outcome.releaseError);
    return outcome.result;
  }

  /**
   * Checks `expectedSeq` and writes an append, with the run's lock held. The
   * cached log end still counts here: another process's append changes the
   * log's size, so it is read again.
   */
  async #appendLocked(
    runId: string,
    expectedSeq: number,
    lastSeq: number,
    lines: string,
    snapshot: string | undefined,
  ): Promise<AppendResult> {
    try {
      const end = await this.#logEnd(runId);
      if (end.lastSeq !== expectedSeq) {
        return { ok: false, reason: "conflict", lastSeq: end.lastSeq };
      }
      if (expectedSeq === 0) {
        // A new run: a snapshot left from a deleted log of the same id isn't this run's.
        await rm(this.#file(runId, snapshotSuffix), { force: true });
      }
      await this.#appendLines(runId, lines, end.bytes);
      this.#logEnds.set(runId, { lastSeq, bytes: end.bytes + Buffer.byteLength(lines) });
    } catch (error) {
      // The log may have been cut back, or not: read it again next time.
      this.#logEnds.delete(runId);
      throw error;
    }
    if (snapshot !== undefined) {
      await this.#writeSnapshot(runId, snapshot);
    }
    return { ok: true, lastSeq };
  }

  async events(runId: string, afterSeq = 0): Promise<RunEvent[]> {
    checkRunId(runId);
    const log = await this.#queue.run(runId, () => this.#readLog(runId));
    return log.events.filter((event) => event.seq > afterSeq);
  }

  /**
   * The cached state, or `null` when there is none or it can't be used: a
   * file that is unreadable, or ahead of the log because the log was cut
   * back or deleted. The engine then replays the log.
   */
  async snapshot(runId: string): Promise<RunSnapshot | null> {
    checkRunId(runId);
    return await this.#queue.run(runId, () => this.#readSnapshot(runId));
  }

  async get(runId: string): Promise<RunSummary | null> {
    return summarize(await this.events(runId));
  }

  async list(filter: RunFilter = {}): Promise<RunSummary[]> {
    const summaries: RunSummary[] = [];
    for (const runId of await this.#runIds()) {
      if (await this.#startedBefore(runId, filter.startedSince)) continue;
      const summary = summarize(await this.events(runId));
      if (summary !== null && matchesRunFilter(summary, filter)) {
        summaries.push(summary);
      }
    }
    return summaries.sort(compareRunSummaries);
  }

  /**
   * Whether the run started before `since`, told from its log's first line
   * alone, so `list` reads the logs of only the runs it may give.
   */
  async #startedBefore(runId: string, since: string | undefined): Promise<boolean> {
    if (since === undefined) return false;
    const file = this.#file(runId, logSuffix);
    const startedAt = await this.#queue.run(runId, () => readLogStart(file));
    return startedAt !== undefined && !startedAtOrAfter(startedAt, since);
  }

  async #readSnapshot(runId: string): Promise<RunSnapshot | null> {
    let text: string;
    try {
      text = await readFile(this.#file(runId, snapshotSuffix), "utf8");
    } catch {
      // Missing or not readable: either way the cache can't be used.
      return null;
    }
    const snapshot = parseSnapshot(text);
    if (snapshot === null || snapshot.seq > (await this.#readLog(runId)).events.length) {
      return null;
    }
    return snapshot;
  }

  /** The runs that have a log, worked out from the file names. */
  async #runIds(): Promise<string[]> {
    let names: string[];
    try {
      names = await readdir(this.#root);
    } catch (error) {
      if (isMissing(error)) {
        return [];
      }
      throw error;
    }
    return names
      .filter((name) => name.endsWith(logSuffix))
      .map((name) => name.slice(0, -logSuffix.length))
      .filter(isRunId);
  }

  /**
   * Where the log ends: from the last append when the file still has the
   * size it left, otherwise by reading the whole log. A torn last line found
   * that way is cut off, so the next events don't get glued onto it.
   */
  async #logEnd(runId: string): Promise<LogEnd> {
    const known = this.#logEnds.get(runId);
    if (known !== undefined && (await this.#logSize(runId)) === known.bytes) {
      return known;
    }
    const log = await this.#readLog(runId, { forWrite: true });
    if (log.events.length === 0 && (await this.#listedUnderOtherCase(runId))) {
      // A log without a whole line can't tell whose it is, but its name can.
      throw otherCaseClash(runId);
    }
    if (log.torn) {
      await truncate(this.#file(runId, logSuffix), log.intactBytes);
    }
    return { lastSeq: log.events.length, bytes: log.intactBytes };
  }

  /** The log's size in bytes, 0 when it is missing. */
  async #logSize(runId: string): Promise<number> {
    try {
      return (await stat(this.#file(runId, logSuffix))).size;
    } catch (error) {
      if (isMissing(error)) {
        return 0;
      }
      throw error;
    }
  }

  /**
   * The run's log. A log of a run whose id differs only in letter case is not
   * this run's: a read finds no events, but a write refuses it, because
   * appending would damage the other run's log and snapshot.
   */
  async #readLog(runId: string, { forWrite = false } = {}): Promise<RunLog> {
    const file = `${runId}${logSuffix}`;
    let bytes: Uint8Array;
    try {
      bytes = await readFile(join(this.#root, file));
    } catch (error) {
      if (isMissing(error)) {
        return { events: [], intactBytes: 0, torn: false };
      }
      throw error;
    }
    if (isLogOfOtherCase(bytes, runId)) {
      if (forWrite) {
        throw otherCaseClash(runId);
      }
      return { events: [], intactBytes: 0, torn: false };
    }
    return parseRunLog(bytes, runId, file);
  }

  /**
   * Whether `<runId>.jsonl` opens a file the folder lists under another
   * name, as only a case-insensitive file system does. It lists the folder
   * only when the file is there, so a new run costs one `stat`.
   */
  async #listedUnderOtherCase(runId: string): Promise<boolean> {
    const name = `${runId}${logSuffix}`;
    try {
      await stat(join(this.#root, name));
    } catch (error) {
      if (isMissing(error)) {
        return false;
      }
      throw error;
    }
    return !(await readdir(this.#root)).includes(name);
  }

  /**
   * Adds the lines to the log, all of them or none. A write can fail part-way
   * (a full disk, an I/O error) after some whole lines are out, and those
   * would count as stored; so on a failure the log is cut back to
   * `intactBytes`, its size before this append, and the error is passed on.
   */
  async #appendLines(runId: string, lines: string, intactBytes: number): Promise<void> {
    const file = this.#file(runId, logSuffix);
    try {
      await appendFile(file, lines, "utf8");
    } catch (error) {
      await cutBack(file, intactBytes);
      throw error;
    }
  }

  /**
   * Replaces the snapshot through a temporary file and a rename, so a reader
   * sees the old snapshot or the new one, never half of one. The events are
   * already stored by then, and the log is the truth: when this fails, the
   * older snapshot stays, the engine replays the events after it, and the
   * append still succeeds. The error goes to the `onSnapshotError` hook.
   */
  async #writeSnapshot(runId: string, text: string): Promise<void> {
    const file = this.#file(runId, snapshotSuffix);
    const temporary = `${file}.tmp`;
    try {
      await writeFile(temporary, text, "utf8");
      await renameOver(temporary, file);
    } catch (error) {
      // A temporary file left behind is replaced by the next snapshot.
      await rm(temporary, { force: true }).catch(() => {});
      this.#onSnapshotError(runId, error);
    }
  }

  #file(runId: string, suffix: string): string {
    return join(this.#root, `${runId}${suffix}`);
  }
}

/**
 * Cuts a log back to `size` bytes after a failed append. When that fails as
 * well, the failed append's error is the one worth reporting, so this one is
 * dropped; the lines left behind then count as stored, as after a crash.
 */
async function cutBack(file: string, size: number): Promise<void> {
  try {
    await truncate(file, size);
  } catch {
    // Missing (the write failed before creating it) or not writable.
  }
}

/**
 * The error of an append under an id that differs from a stored run's only in
 * letter case, on a case-insensitive file system. It is `invalid_input`, not
 * a conflict: the log hasn't moved on, and trying again can't help.
 */
function otherCaseClash(runId: string): KindedError {
  return new KindedError(
    "invalid_input",
    `Run id ${runId} clashes with a stored run whose id differs only in letter case, on a case-insensitive file system.`,
  );
}

/** A stored snapshot, or `null` when the text isn't one. */
function parseSnapshot(text: string): RunSnapshot | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const { seq, state } = (parsed ?? {}) as Partial<RunSnapshot>;
  if (!Number.isSafeInteger(seq) || (seq as number) < 1 || state === undefined) {
    return null;
  }
  return { seq: seq as number, state };
}
