// What a tick of the routine scheduler dropped, gathered per routine for its
// skip records: the catch-up rule's ranges, single times the overlap rule or a
// changed routine dropped, and the times whose start was refused.

import { errorKindOf } from "@halonicjs/std";
import type { LastRuns } from "./routine-last-runs.ts";
import type { SkippedTimes, SkipReason, SkipRecords } from "./routine-skips.ts";

/** A range of a routine's due times the tick function dropped, with the routine key. */
export type DroppedRange = SkippedTimes & { key: string };

/** A due time and the routine it belongs to. */
interface DueTime {
  key: string;
  at: Date;
}

/** What a skip carries besides its reason: `why` for `target-unavailable`, `sentence`, `fix` and `toCommand` for `start-refused`. */
type SkipDetail = Pick<SkippedTimes, "why" | "sentence" | "fix" | "toCommand">;

/** Single times of one routine dropped for one reason and detail. */
interface SingleTimes extends SkipDetail {
  reason: SkipReason;
  times: Date[];
}

/** Gathers a tick's dropped times by routine, then adds them to the skip records. */
export class TickSkips {
  private readonly byKey = new Map<string, SkippedTimes[]>();
  /** By routine key, then by reason and detail together. */
  private readonly singles = new Map<string, Map<string, SingleTimes>>();

  /** Ranges the tick function dropped (the catch-up rule). */
  addRanges(ranges: readonly DroppedRange[]): void {
    for (const { key, ...range } of ranges) {
      this.byKey.set(key, [...(this.byKey.get(key) ?? []), range]);
    }
  }

  /**
   * Single due times dropped for one reason and its detail (the `why` of
   * `target-unavailable`, the sentence and step of `start-refused`); one tick's times
   * of a routine for one reason and detail make one range.
   */
  addTimes(times: readonly DueTime[], reason: SkipReason, detail: SkipDetail = {}): void {
    const group = JSON.stringify([
      reason,
      detail.why,
      detail.sentence,
      detail.fix,
      detail.toCommand,
    ]);
    for (const { key, at } of times) {
      const reasons = this.singles.get(key) ?? new Map<string, SingleTimes>();
      const single = reasons.get(group) ?? { reason, ...detail, times: [] };
      single.times.push(at);
      reasons.set(group, single);
      this.singles.set(key, reasons);
    }
  }

  /**
   * A due time whose start was refused, as `start-refused` with the error's
   * message as its sentence and its `fix` as the next step when the error has
   * a kind: a `KindedError`'s message and fix are safe to show, and an
   * `internal` one's are not. A step that leads to a command (the error's
   * `command`, which the Run panel shows in a CommandBox) sets `toCommand`.
   */
  addRefused(time: DueTime, error: unknown): void {
    if (errorKindOf(error) === "internal" || !(error instanceof Error)) {
      this.addTimes([time], "start-refused");
      return;
    }
    const fix = "fix" in error && typeof error.fix === "string" ? error.fix : undefined;
    const toCommand =
      fix !== undefined &&
      "command" in error &&
      typeof error.command === "string" &&
      error.command !== "";
    this.addTimes([time], "start-refused", {
      sentence: error.message,
      ...(fix === undefined ? {} : { fix }),
      ...(toCommand ? { toCommand: true as const } : {}),
    });
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
      for (const { times, ...detail } of reasons.values()) {
        const millis = times.map((time) => time.getTime());
        const range: SkippedTimes = {
          ...detail,
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
