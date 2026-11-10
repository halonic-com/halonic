import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import {
  type RunLockRecord,
  runLockFormat,
  runLockStaleAfterMs,
  runLockTakeoverStaleAfterMs,
} from "@halonicjs/ports";
import { type BusySystem, nodeBusySystem, retryWhileBusy } from "./busy-retry.ts";
import { isMissing, lstatOrNull } from "./links.ts";

/** How long to wait before trying again to take a lock another writer holds. */
const retryDelayMs = 15;

/**
 * The largest process id `process.kill` takes (2³¹ − 1). It refuses larger
 * ids, so a lock that names one is judged as held by no running process.
 */
const maxProcessId = 2 ** 31 - 1;

/** A lock file as found on disk. */
export interface FoundLock {
  /** The file's text, as the writer that took the lock wrote it. */
  text: string;
  /** The record in it, or `null` when the text isn't one. */
  record: RunLockRecord | null;
  /** When the file was last changed, in milliseconds since 1970. */
  changedAt: number;
}

/**
 * Runs `work` while holding the run lock `file`, so no other process appends
 * to the run at the same time. Follows the rules `RunLockRecord` in
 * `@halonicjs/ports` sets out, which the Tauri adapter follows too: waits
 * while another writer holds the lock, removes a stale one, and releases
 * the lock once `work` has settled. On Windows, each file step that fails
 * because another writer is deleting or holding the lock file right now is
 * tried again (see `retryWhileBusy`).
 *
 * @param file - the lock file, `<runId>.lock` in an existing folder
 * @param system - the platform and clock the busy retries use; tests play Windows with it
 */
export async function withRunLock<T>(
  file: string,
  work: () => Promise<T>,
  system: BusySystem = nodeBusySystem,
): Promise<T> {
  const ownText = await takeLock(file, system);
  try {
    return await work();
  } finally {
    await retryWhileBusy(() => releaseLock(file, ownText), system);
  }
}

/** Takes the lock, waiting as long as a live writer holds it, and gives the text written into it. */
async function takeLock(file: string, system: BusySystem): Promise<string> {
  while (true) {
    const ownText = JSON.stringify(ownRecord());
    if (await retryWhileBusy(() => createExclusive(file, ownText), system)) {
      return ownText;
    }
    const found = await readTakenLock(file, system);
    if (found === null) {
      // Released between our create and our read: try again straight away.
      continue;
    }
    if (isStale(found, Date.now())) {
      await removeStale(file, found.text, system);
      continue;
    }
    await sleep(retryDelayMs);
  }
}

/**
 * The lock (or takeover file) another writer holds, read after an exclusive
 * create found `file` there; or `null` when that writer released it in
 * between.
 *
 * @throws Error when `file` is a symbolic link to a file that isn't there:
 *   the create always finds it and the read never does, so trying again
 *   would never end
 */
export async function readTakenLock(file: string, system: BusySystem): Promise<FoundLock | null> {
  const found = await retryWhileBusy(() => readLock(file), system);
  if (found === null && (await lstatOrNull(file))?.isSymbolicLink()) {
    throw new Error(
      `The lock ${file} is a link to a file that isn't there. Remove the link and try again.`,
    );
  }
  return found;
}

/** The record this process writes into a lock it takes, taken now. */
export function ownRecord(): RunLockRecord {
  return {
    version: runLockFormat,
    pid: process.pid,
    host: hostname(),
    takenAt: new Date().toISOString(),
  };
}

/** Creates `file` holding `text`, or gives `false` when it is already there. */
export async function createExclusive(file: string, text: string): Promise<boolean> {
  try {
    await writeFile(file, text, { encoding: "utf8", flag: "wx" });
    return true;
  } catch (error) {
    if ((error as { code?: unknown }).code === "EEXIST") {
      return false;
    }
    throw error;
  }
}

/** The lock file as it is now, or `null` when there is none. */
export async function readLock(file: string): Promise<FoundLock | null> {
  try {
    const [text, stats] = await Promise.all([readFile(file, "utf8"), stat(file)]);
    return { text, record: parseRecord(text), changedAt: stats.mtimeMs };
  } catch (error) {
    if (isMissing(error)) {
      return null;
    }
    throw error;
  }
}

/** The record in a lock file, or `null` when the text isn't one. */
export function parseRecord(text: string): RunLockRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const { version, pid, host, takenAt } = (parsed ?? {}) as Partial<RunLockRecord>;
  const valid =
    Number.isSafeInteger(version) &&
    // 0 and negative ids name process groups for `process.kill`, never one process.
    Number.isSafeInteger(pid) &&
    (pid as number) > 0 &&
    typeof host === "string" &&
    typeof takenAt === "string";
  return valid ? { version: version as number, pid: pid as number, host, takenAt } : null;
}

/** What a lock is judged against: this computer's name, and whether a process runs here. */
export interface ThisComputer {
  host: string;
  processRuns(pid: number): boolean;
}

/**
 * Whether a lock may be removed: older than the limit (or from the future
 * by as much, a clock that was off), or taken on this computer by a process
 * that no longer runs. A file that holds no record yet may be one a writer
 * is still writing, so only its age counts. The Rust run lock in the Studio
 * shell judges the same cases alike (`run-lock-cases.json`).
 */
export function isStale(
  found: FoundLock,
  now: number,
  here: ThisComputer = { host: hostname(), processRuns },
): boolean {
  const takenAt = found.record === null ? found.changedAt : Date.parse(found.record.takenAt);
  if (!(Math.abs(now - takenAt) <= runLockStaleAfterMs)) {
    return true;
  }
  if (found.record === null || found.record.host !== here.host) {
    return false;
  }
  const { pid } = found.record;
  return !(pid <= maxProcessId && here.processRuns(pid));
}

/** Whether a process with this id runs on this computer. */
function processRuns(pid: number): boolean {
  try {
    // Signal 0 sends nothing; it only checks that the process is there.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it runs, as another user. ESRCH: there is no such process.
    return (error as { code?: unknown }).code === "EPERM";
  }
}

/**
 * Removes the stale lock that held `staleText`, unless another writer has
 * removed it since. Only one writer removes a lock at a time: the one that
 * creates `<file>.takeover`. Holding it, it reads the lock again and removes
 * it only while it still holds `staleText`, so a lock another writer took in
 * the meantime is never touched. A writer that finds the takeover file there
 * waits, and the caller tries again.
 *
 * One gap is left: a writer that still runs past the stale limit could
 * release its lock, and another take a fresh one, between the read and the
 * removal. A run lock is held for milliseconds, far below the limit.
 */
export async function removeStale(
  file: string,
  staleText: string,
  system: BusySystem,
): Promise<void> {
  const takeover = `${file}.takeover`;
  const takeoverText = JSON.stringify(ownRecord());
  if (!(await retryWhileBusy(() => createExclusive(takeover, takeoverText), system))) {
    await removeAbandonedTakeover(takeover, system);
    await sleep(retryDelayMs);
    return;
  }
  try {
    const found = await retryWhileBusy(() => readLock(file), system);
    if (found?.text === staleText) {
      await retryWhileBusy(() => rm(file, { force: true }), system);
    }
  } finally {
    await retryWhileBusy(() => releaseLock(takeover, takeoverText), system);
  }
}

/**
 * Removes the takeover file when it is older than
 * {@link runLockTakeoverStaleAfterMs} (or from the future by as much): its
 * writer crashed while removing a stale lock, and would otherwise keep
 * every writer from removing it.
 *
 * Two writers that find the same old takeover file at the same moment could
 * both remove it, and the second remove the first one's new takeover file.
 * That takes a remover that crashed first, so it is left as it is.
 */
async function removeAbandonedTakeover(takeover: string, system: BusySystem): Promise<void> {
  const found = await readTakenLock(takeover, system);
  if (found !== null && !(Math.abs(Date.now() - found.changedAt) <= runLockTakeoverStaleAfterMs)) {
    await retryWhileBusy(() => rm(takeover, { force: true }), system);
  }
}

/**
 * Removes the lock, but only while it holds `ownText`: when this writer took
 * so long that another removed its lock as stale, the lock now belongs to
 * that other writer. The caller retries it whole while Windows reports it
 * busy, so the lock isn't left behind for other writers to wait on.
 */
export async function releaseLock(file: string, ownText: string): Promise<void> {
  const found = await readLock(file);
  if (found?.text === ownText) {
    await rm(file, { force: true });
  }
}
