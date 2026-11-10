import { randomUUID } from "node:crypto";
import { link, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { type RunLockRecord, runLockFormat, runLockStaleAfterMs } from "@halonicjs/ports";
import { isMissing } from "./links.ts";

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
 * the lock once `work` has settled.
 *
 * @param file - the lock file, `<runId>.lock` in an existing folder
 */
export async function withRunLock<T>(file: string, work: () => Promise<T>): Promise<T> {
  const ownText = await takeLock(file);
  try {
    return await work();
  } finally {
    await releaseLock(file, ownText);
  }
}

/** Takes the lock, waiting as long as a live writer holds it, and gives the text written into it. */
async function takeLock(file: string): Promise<string> {
  while (true) {
    const ownText = JSON.stringify(ownRecord());
    if (await createExclusive(file, ownText)) {
      return ownText;
    }
    const found = await readLock(file);
    if (found === null) {
      // Released between our create and our read: try again straight away.
      continue;
    }
    if (isStale(found, Date.now())) {
      await removeStale(file, found.text);
      continue;
    }
    await sleep(retryDelayMs);
  }
}

function ownRecord(): RunLockRecord {
  return {
    version: runLockFormat,
    pid: process.pid,
    host: hostname(),
    takenAt: new Date().toISOString(),
  };
}

/** Creates `file` holding `text`, or gives `false` when it is already there. */
async function createExclusive(file: string, text: string): Promise<boolean> {
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
async function readLock(file: string): Promise<FoundLock | null> {
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
 * Removes a stale lock that held `staleText`. Another writer may have
 * removed it and taken a fresh lock since it was read, so the lock is moved
 * aside first and checked: when it isn't the stale one any more, it is put
 * back, unless a third writer has taken the lock by then.
 */
async function removeStale(file: string, staleText: string): Promise<void> {
  const aside = `${file}.${randomUUID()}.stale`;
  try {
    await rename(file, aside);
  } catch (error) {
    if (isMissing(error)) {
      return;
    }
    throw error;
  }
  try {
    if ((await readFile(aside, "utf8")) !== staleText) {
      await putBack(aside, file);
    }
  } finally {
    await rm(aside, { force: true });
  }
}

/** Links `aside` back to `file`, unless `file` is there again. */
async function putBack(aside: string, file: string): Promise<void> {
  try {
    await link(aside, file);
  } catch (error) {
    if ((error as { code?: unknown }).code !== "EEXIST") {
      throw error;
    }
  }
}

/**
 * Removes the lock, but only while it holds `ownText`: when this writer took
 * so long that another removed its lock as stale, the lock now belongs to
 * that other writer.
 */
async function releaseLock(file: string, ownText: string): Promise<void> {
  const found = await readLock(file);
  if (found?.text === ownText) {
    await rm(file, { force: true });
  }
}
