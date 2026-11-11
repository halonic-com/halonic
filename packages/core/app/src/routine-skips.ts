import type { Coordination } from "@halonicjs/ports";
import type { SkipReason as CatchUpReason } from "@halonicjs/routines";
import { queueLostKey, shortHash, skipsKeyByHash } from "./routine-ids.ts";
import { deleteValue } from "./routine-last-runs.ts";

/**
 * Why a routine's due time didn't start. The catch-up rule: `missed` (catch-up
 * off), `latest` ("run once" kept a newer time), `cap` (past the most times
 * caught up), `window` (older than the catch-up window). The overlap rule:
 * `busy` (the last run was still going, or the queue was full). `changed`: a
 * queued time whose routine was turned off or rescheduled before it started.
 * `target-unavailable`: the workflow or agent it starts can't be started,
 * for the reason in `why` (see {@link TargetUnavailableWhy}).
 */
export type SkipReason = CatchUpReason | "busy" | "changed" | "target-unavailable";

/**
 * Why a routine's target can't be started (flow-routines 3.9): it has
 * never been in a version (`never-live`, "Briefing isn't live yet"), or it
 * is live but its saved file is gone, as in the trash (`in-trash`,
 * "Briefing is in the trash").
 */
export type TargetUnavailableWhy = "never-live" | "in-trash";

/** Due times of one routine a tick dropped for one reason, to add to its records. */
export interface SkippedTimes {
  reason: SkipReason;
  /** For `target-unavailable` only: why the target can't be started. */
  why?: TargetUnavailableWhy;
  /** The oldest dropped time. */
  from: Date;
  /** The newest dropped time. */
  to: Date;
  /** How many, `from` and `to` included. */
  count: number;
  /** Set when counting stopped at its limit, so there were at least `count`. */
  countIsMinimum?: true;
}

/** A row of a routine's skipped times, as kept and read. */
export interface SkipRecord {
  reason: SkipReason;
  /** For `target-unavailable` only: why the target can't be started. */
  why?: TargetUnavailableWhy;
  /** ISO time of the oldest skipped time. */
  from: string;
  /** ISO time of the newest skipped time. */
  to: string;
  count: number;
  /** ISO time of the tick that last added to the row. */
  decidedAt: string;
  countIsMinimum?: true;
}

/** The most rows kept per routine; the oldest go first. */
export const MAX_SKIP_RECORDS = 20;

/** How often {@link SkipRecords.add} reads again after another host stored first. */
const maxAttempts = 3;

/**
 * The rows with `skips` added, newest first, at most {@link MAX_SKIP_RECORDS}.
 * A skip continues the newest row when the reason is the same, it comes after
 * that row's newest time and no run of the routine was due in between
 * (`lastRun`, the due time of its last started run, read before this tick
 * started anything). A skip a row of the same reason already holds, as when
 * a tick is recorded twice, adds nothing, also when the tick added two rows.
 */
export function addSkips(
  rows: readonly SkipRecord[],
  skips: readonly SkippedTimes[],
  lastRun: Date | null,
  decidedAt: Date,
): SkipRecord[] {
  const next = [...rows];
  const oldestFirst = [...skips].sort((a, b) => a.from.getTime() - b.from.getTime());
  for (const skip of oldestFirst) {
    if (next.some((row) => holds(row, skip))) {
      continue;
    }
    const newest = next[0];
    if (newest !== undefined && continues(newest, skip, lastRun)) {
      next[0] = merged(newest, skip, decidedAt);
    } else {
      next.unshift(recordOf(skip, decidedAt));
    }
  }
  return next.slice(0, MAX_SKIP_RECORDS);
}

/** Whether a row and a skip are for the same reason, and the same `why` (two texts make two rows). */
function sameReason(row: SkipRecord, skip: SkippedTimes): boolean {
  return row.reason === skip.reason && row.why === skip.why;
}

function holds(row: SkipRecord, skip: SkippedTimes): boolean {
  return (
    sameReason(row, skip) &&
    Date.parse(row.from) <= skip.from.getTime() &&
    skip.to.getTime() <= Date.parse(row.to)
  );
}

function continues(row: SkipRecord, skip: SkippedTimes, lastRun: Date | null): boolean {
  const rowEnd = Date.parse(row.to);
  if (!sameReason(row, skip) || skip.from.getTime() <= rowEnd) {
    return false;
  }
  const ranBetween =
    lastRun !== null && lastRun.getTime() > rowEnd && lastRun.getTime() < skip.from.getTime();
  return !ranBetween;
}

function merged(row: SkipRecord, skip: SkippedTimes, decidedAt: Date): SkipRecord {
  const countIsMinimum = row.countIsMinimum === true || skip.countIsMinimum === true;
  return {
    reason: row.reason,
    ...(row.why === undefined ? {} : { why: row.why }),
    from: row.from,
    to: skip.to.toISOString(),
    count: row.count + skip.count,
    decidedAt: decidedAt.toISOString(),
    ...(countIsMinimum ? { countIsMinimum: true } : {}),
  };
}

function recordOf(skip: SkippedTimes, decidedAt: Date): SkipRecord {
  return {
    reason: skip.reason,
    ...(skip.why === undefined ? {} : { why: skip.why }),
    from: skip.from.toISOString(),
    to: skip.to.toISOString(),
    count: skip.count,
    decidedAt: decidedAt.toISOString(),
    ...(skip.countIsMinimum === true ? { countIsMinimum: true } : {}),
  };
}

/**
 * Keeps, per routine of a workspace, the due times its scheduler dropped,
 * as rows of {@link SkipRecord}, so a Runs view can say "Skipped 06:00, the
 * computer was asleep". Each routine's rows are a `Coordination` value of
 * their own, so the records stay small however many routines there are.
 */
export class SkipRecords {
  private readonly coordination: Coordination;
  private readonly workspaceId: string;

  constructor(coordination: Coordination, workspaceId: string) {
    this.coordination = coordination;
    this.workspaceId = workspaceId;
  }

  /** A routine's rows, newest first; none if nothing was skipped or the value can't be read. */
  async read(routineKey: string): Promise<SkipRecord[]> {
    return readRecords(await this.coordination.read(this.keyOf(shortHash(routineKey))));
  }

  /**
   * Adds a tick's skips of a routine (see {@link addSkips}). If another host
   * stores the routine's rows in between, it reads them again and retries.
   *
   * @returns whether the skips are stored
   */
  async add(
    routineKey: string,
    skips: readonly SkippedTimes[],
    lastRun: Date | null,
    decidedAt: Date,
  ): Promise<boolean> {
    if (skips.length === 0) {
      return true;
    }
    const key = this.keyOf(shortHash(routineKey));
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const stored = await this.coordination.read(key);
      const rows = addSkips(readRecords(stored), skips, lastRun, decidedAt);
      if (await this.coordination.compareAndSet(key, stored, JSON.stringify(rows))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Deletes the rows of a removed routine, by the hash of its key as the
   * last-run index keeps it. If another host stores them in between, it
   * reads them again and retries, up to three times.
   *
   * @returns whether the rows are gone
   */
  forget(keyHash: string): Promise<boolean> {
    return deleteValue(this.coordination, this.keyOf(keyHash));
  }

  /** Notes that the stored queue couldn't be read at `decidedAt`, so its times are gone unlisted. */
  async queueLost(decidedAt: Date): Promise<void> {
    const key = queueLostKey(this.workspaceId);
    const stored = await this.coordination.read(key);
    // A lost race means another host noted the same loss.
    await this.coordination.compareAndSet(key, stored, decidedAt.toISOString());
  }

  /** When the stored queue was last found unreadable, or `null` if never. */
  async lastQueueLoss(): Promise<string | null> {
    return this.coordination.read(queueLostKey(this.workspaceId));
  }

  private keyOf(keyHash: string): string {
    return skipsKeyByHash(this.workspaceId, keyHash);
  }
}

// A record, so a reason added to the routines package fails the typecheck until it's listed here.
const knownReasons: Record<SkipReason, true> = {
  missed: true,
  latest: true,
  cap: true,
  window: true,
  busy: true,
  changed: true,
  "target-unavailable": true,
};
const reasons: ReadonlySet<string> = new Set(Object.keys(knownReasons));

const knownWhys: Record<TargetUnavailableWhy, true> = { "never-live": true, "in-trash": true };
const whys: ReadonlySet<string> = new Set(Object.keys(knownWhys));

/**
 * Reads what {@link SkipRecords.add} wrote. Only the scheduler writes it, so
 * a value that isn't a list counts as no rows, and a row that isn't one is
 * left out, rather than stopping the routine's ticks.
 */
function readRecords(text: string | null): SkipRecord[] {
  if (text === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
}

function isRecord(value: unknown): value is SkipRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as Partial<Record<keyof SkipRecord, unknown>>;
  return (
    typeof row.reason === "string" &&
    reasons.has(row.reason) &&
    (row.reason === "target-unavailable"
      ? typeof row.why === "string" && whys.has(row.why)
      : row.why === undefined) &&
    isTime(row.from) &&
    isTime(row.to) &&
    isTime(row.decidedAt) &&
    typeof row.count === "number" &&
    Number.isSafeInteger(row.count) &&
    row.count > 0
  );
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
