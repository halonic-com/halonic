import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  truncate,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { type RunEvent, type RunSummary, summarize } from "@halonicjs/events";
import {
  type AppendOptions,
  type AppendResult,
  checkRunAppend,
  compareRunSummaries,
  matchesRunFilter,
  type RunFilter,
  type RunSnapshot,
  type RunStore,
} from "@halonicjs/ports";
import { KeyedQueue } from "@halonicjs/std";
import { isMissing } from "./links.ts";
import { formatLogLines, parseRunLog, type RunLog } from "./run-log.ts";

const logSuffix = ".jsonl";
const snapshotSuffix = ".snapshot.json";

/** Letters, digits, `_`, `-` and `.`, not starting with a dot, at most 128 characters: a safe file name everywhere. */
const runIdPattern = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/u;
/** Names Windows opens as a device whatever the extension, such as `NUL.jsonl`. */
const windowsDeviceName = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/iu;

/**
 * Run logs as files in one folder: `<runId>.jsonl` holds the run's events,
 * one per line, and only ever grows; `<runId>.snapshot.json` caches the
 * engine's state and may be deleted at any time. The list is worked out
 * from the logs on every call, so deleting a log removes the run.
 *
 * Appends to one run go one at a time, so `expectedSeq` holds within this
 * process. Two processes must not write to the same folder. An append that
 * fails stores nothing, but one cut off by a crash of the program may leave
 * the first events of its batch stored.
 */
export class FolderRunStore implements RunStore {
  readonly #root: string;
  readonly #appends = new KeyedQueue();

  /** @param root - the folder for the run files; created on the first append */
  constructor(root: string) {
    this.#root = resolve(root);
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
    return await this.#appends.run(runId, async () => {
      const log = await this.#readLog(runId);
      if (log.events.length !== expectedSeq) {
        return { ok: false, reason: "conflict", lastSeq: log.events.length };
      }
      await mkdir(this.#root, { recursive: true });
      if (log.torn) {
        // Cut the torn line off first, so the new events don't get glued onto it.
        await truncate(this.#file(runId, logSuffix), log.intactBytes);
      }
      if (expectedSeq === 0) {
        // A new run: a snapshot left from a deleted log of the same id isn't this run's.
        await rm(this.#file(runId, snapshotSuffix), { force: true });
      }
      await this.#appendLines(runId, lines, log.intactBytes);
      if (snapshot !== undefined) {
        await this.#writeSnapshot(runId, snapshot);
      }
      return { ok: true, lastSeq };
    });
  }

  async events(runId: string, afterSeq = 0): Promise<RunEvent[]> {
    checkRunId(runId);
    return (await this.#readLog(runId)).events.filter((event) => event.seq > afterSeq);
  }

  /**
   * The cached state, or `null` when there is none or it can't be used: a
   * file that is unreadable, or ahead of the log because the log was cut
   * back or deleted. The engine then replays the log.
   */
  async snapshot(runId: string): Promise<RunSnapshot | null> {
    checkRunId(runId);
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

  async get(runId: string): Promise<RunSummary | null> {
    return summarize(await this.events(runId));
  }

  async list(filter: RunFilter = {}): Promise<RunSummary[]> {
    const summaries: RunSummary[] = [];
    for (const runId of await this.#runIds()) {
      const summary = summarize((await this.#readLog(runId)).events);
      if (summary !== null && matchesRunFilter(summary, filter)) {
        summaries.push(summary);
      }
    }
    return summaries.sort(compareRunSummaries);
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

  async #readLog(runId: string): Promise<RunLog> {
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
    return parseRunLog(bytes, runId, file);
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
   * append still succeeds.
   */
  async #writeSnapshot(runId: string, text: string): Promise<void> {
    const file = this.#file(runId, snapshotSuffix);
    const temporary = `${file}.tmp`;
    try {
      await writeFile(temporary, text, "utf8");
      await rename(temporary, file);
    } catch {
      await rm(temporary, { force: true });
    }
  }

  #file(runId: string, suffix: string): string {
    return join(this.#root, `${runId}${suffix}`);
  }
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

function isRunId(runId: string): boolean {
  return runIdPattern.test(runId) && !windowsDeviceName.test(runId);
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
