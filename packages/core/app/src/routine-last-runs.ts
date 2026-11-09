import type { Coordination } from "@halonicjs/ports";
import {
  lastRunIndexKey,
  lastRunKey,
  lastRunKeyByHash,
  shortHash,
  utf8Length,
} from "./routine-ids.ts";

/** The due time of a routine's last started run, as read from `Coordination`. */
export interface StoredLastRun {
  /** The `Coordination` key it is kept under. */
  key: string;
  /** The stored value, for the compare-and-set that replaces it. */
  stored: string | null;
  /** The due time, or `null` before the routine's first run. */
  at: Date | null;
}

/** The most UTF-8 bytes of the stored index: under the 64 KiB a `Coordination` value may hold. */
const maxIndexBytes = 60_000;

/**
 * Keeps, per routine of a workspace, the due time of the last run the
 * scheduler started, for `{{trigger.lastRun}}`. Each time is a key of its
 * own in `Coordination`; an index of the routines that may have one lets
 * {@link LastRuns.forgetRemoved} delete the times of removed routines, since
 * `Coordination` can't list its keys.
 */
export class LastRuns {
  private readonly coordination: Coordination;
  private readonly workspaceId: string;
  private readonly indexKey: string;

  constructor(coordination: Coordination, workspaceId: string) {
    this.coordination = coordination;
    this.workspaceId = workspaceId;
    this.indexKey = lastRunIndexKey(workspaceId);
  }

  /** The last run of a routine, by its key. */
  async read(routineKey: string): Promise<StoredLastRun> {
    const key = lastRunKey(this.workspaceId, routineKey);
    const stored = await this.coordination.read(key);
    return { key, stored, at: stored === null ? null : new Date(stored) };
  }

  /**
   * Stores `at` as the routine's last run, if it is later than the one read.
   * The time never moves back: a repeated start finds its own time stored,
   * and a lost race means another host stored a time first.
   */
  async save(last: StoredLastRun, at: Date): Promise<void> {
    if (last.at !== null && last.at.getTime() >= at.getTime()) {
      return;
    }
    await this.coordination.compareAndSet(last.key, last.stored, at.toISOString());
  }

  /**
   * Deletes the last run of every routine in the index that is not among
   * `routineKeys`, the routines of the workspace now, and stores those as the
   * index. Call it before starting runs, so every time {@link save} stores
   * belongs to a routine the index already names.
   *
   * A routine only one host can see yet (its file is still syncing) may lose
   * its time on the other; its next run then gets a `lastRun` of `null`. An
   * index too large for a `Coordination` value (thousands of routines) is not
   * stored, so the times of routines added since are never deleted.
   */
  async forgetRemoved(routineKeys: readonly string[]): Promise<void> {
    const stored = await this.coordination.read(this.indexKey);
    const current = new Set(routineKeys.map(shortHash));
    for (const hash of readIndex(stored)) {
      if (!current.has(hash)) {
        await this.delete(lastRunKeyByHash(this.workspaceId, hash));
      }
    }
    const next = writeIndex(current);
    if (next === stored || (next !== null && utf8Length(next) > maxIndexBytes)) {
      return;
    }
    // A lost race means another host stored the index for the same routines.
    await this.coordination.compareAndSet(this.indexKey, stored, next);
  }

  private async delete(key: string): Promise<void> {
    const stored = await this.coordination.read(key);
    if (stored !== null) {
      await this.coordination.compareAndSet(key, stored, null);
    }
  }
}

/** The index as kept in `Coordination`: JSON of the sorted hashes, or `null` when there are none. */
function writeIndex(hashes: ReadonlySet<string>): string | null {
  if (hashes.size === 0) {
    return null;
  }
  return JSON.stringify([...hashes].sort());
}

/**
 * Reads what {@link writeIndex} wrote. Only the scheduler writes the key, so
 * anything else (a hand edit, a damaged store) counts as an empty index
 * rather than stopping every routine of the workspace.
 */
function readIndex(text: string | null): string[] {
  if (text === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  // Only hashes as `shortHash` makes them, so a damaged index can't name another key to delete.
  return parsed.filter(
    (hash): hash is string => typeof hash === "string" && hashPattern.test(hash),
  );
}

const hashPattern = /^[0-9a-f]{16}$/;
