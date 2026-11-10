// What a tick of the routine scheduler dropped, gathered per routine for its
// skip records: the catch-up rule's ranges, and single times the overlap rule
// or a changed routine dropped.

import type { LastRuns } from "./routine-last-runs.ts";
import type { SkippedTimes, SkipReason, SkipRecords } from "./routine-skips.ts";

/** A range of a routine's due times the tick function dropped, with the routine key. */
export type DroppedRange = SkippedTimes & { key: string };

/** A due time and the routine it belongs to. */
interface DueTime {
  key: string;
  at: Date;
}

/** Gathers a tick's dropped times by routine, then adds them to the skip records. */
export class TickSkips {
  private readonly byKey = new Map<string, SkippedTimes[]>();
  private readonly singles = new Map<string, Map<SkipReason, Date[]>>();

  /** Ranges the tick function dropped (the catch-up rule). */
  addRanges(ranges: readonly DroppedRange[]): void {
    for (const { key, ...range } of ranges) {
      this.byKey.set(key, [...(this.byKey.get(key) ?? []), range]);
    }
  }

  /** Single due times dropped for one reason; one tick's times of a routine make one range. */
  addTimes(times: readonly DueTime[], reason: SkipReason): void {
    for (const { key, at } of times) {
      const reasons = this.singles.get(key) ?? new Map<SkipReason, Date[]>();
      reasons.set(reason, [...(reasons.get(reason) ?? []), at]);
      this.singles.set(key, reasons);
    }
  }

  /**
   * Adds every routine's skips to `records`, reading each routine's last run
   * first so a skip after a run starts a new row. Call it before the tick
   * starts anything, so the last run is the one before this tick.
   *
   * @returns the routines whose skips could not be stored, with why; the
   *   tick goes on, since the runs matter more than their trace
   */
  async record(
    records: SkipRecords,
    lastRuns: LastRuns,
    decidedAt: Date,
  ): Promise<{ key: string; error: Error }[]> {
    this.foldSingles();
    const notSaved: { key: string; error: Error }[] = [];
    for (const [key, skips] of this.byKey) {
      try {
        const lastRun = await lastRuns.read(key);
        if (!(await records.add(key, skips, lastRun.at, decidedAt))) {
          notSaved.push({ key, error: new Error("Other hosts kept changing the skip records.") });
        }
      } catch (error) {
        notSaved.push({ key, error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
    return notSaved;
  }

  private foldSingles(): void {
    for (const [key, reasons] of this.singles) {
      for (const [reason, times] of reasons) {
        const millis = times.map((time) => time.getTime());
        const range: SkippedTimes = {
          reason,
          from: new Date(Math.min(...millis)),
          to: new Date(Math.max(...millis)),
          count: new Set(millis).size,
        };
        this.byKey.set(key, [...(this.byKey.get(key) ?? []), range]);
      }
    }
    this.singles.clear();
  }
}
