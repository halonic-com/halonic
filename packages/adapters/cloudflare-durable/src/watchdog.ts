import type { RunStatus } from "@halonicjs/events";
import type { RunStore } from "@halonicjs/ports";
import type { Clock } from "@halonicjs/std";
import type { DurableScheduler } from "./durable-scheduler.ts";
import type { RunHealth } from "./run-object-api.ts";

/** A running run that has added no event for this long is stuck. */
export const defaultQuietAfterMs = 10 * 60 * 1000;
/** A timer that has been due this long without delivery is stuck: the alarm normally delivers it within seconds. */
export const defaultOverdueAfterMs = 2 * 60 * 1000;
/**
 * How many runs one sweep checks at most. A Worker invocation may make only so many calls (50 on the
 * free plan). A sweep makes two before it checks any run (the run list and the routines tick), and then
 * at worst two per run: one to check it and one to wake it when it is stuck. With 20 runs that is
 * 2 + 20 * 2 = 42 calls even when every run is stuck, which leaves some slack. Runs beyond this are
 * checked on later sweeps, in turn ({@link Watchdog}).
 */
export const defaultMaxRunsPerSweep = 20;

/** The id of the timer that wakes a run; the engine handles it as a request to look at the run again. */
export const watchdogTimerId = "watchdog";

/** When a run counts as stuck. */
export interface WatchdogLimits {
  quietAfterMs: number;
  overdueAfterMs: number;
}

/** Why a run was woken. */
export type WakeReason = "overdue-timer" | "no-progress";

/**
 * Whether a run is stuck, and why. Only two things are: a timer that is
 * overdue (its alarm was lost), and a running run that has made no progress for a while. A
 * waiting run with no overdue timer is not stuck, however long it waits: it
 * rightly waits days for an approval. A run whose own log says it has ended is never stuck,
 * even while the run list, which lags, still shows it running.
 */
export function whyStuck(
  status: RunStatus,
  health: RunHealth,
  nowMs: number,
  limits: WatchdogLimits,
): WakeReason | null {
  if (health.ended) return null;
  if (health.overdueMs >= limits.overdueAfterMs) return "overdue-timer";
  if (status === "running" && health.lastEventAt !== null) {
    if (nowMs - Date.parse(health.lastEventAt) >= limits.quietAfterMs) return "no-progress";
  }
  return null;
}

/** What a watchdog needs. */
export interface WatchdogOptions {
  /** The run list, to find the runs that could be stuck. It may lag the logs a little. */
  runs: Pick<RunStore, "list">;
  /** The run objects, for their health and for the timer that wakes a run. */
  scheduler: Pick<DurableScheduler, "schedule" | "health">;
  clock: Clock;
  quietAfterMs?: number;
  overdueAfterMs?: number;
  /** How many runs one sweep checks at most. Defaults to {@link defaultMaxRunsPerSweep}. */
  maxRunsPerSweep?: number;
}

/** A run the watchdog woke, and why. */
export interface WokenRun {
  runId: string;
  reason: WakeReason;
}

/**
 * What one sweep did. A run whose check or wake failed is in `failed`; the others went on.
 * `deferred` counts the runs left for later sweeps.
 */
export interface WatchdogReport {
  woken: WokenRun[];
  failed: { runId: string; error: Error }[];
  deferred: number;
}

const runsAtOnce = 10;

/**
 * Wakes stuck runs, on the routine tick, so no run stays stuck for good. It
 * looks at every running and waiting run in the run list and asks each run
 * object how it is moving ({@link whyStuck}). It wakes a stuck run by setting
 * its `watchdog` timer for now: that delivers the run's overdue timers too,
 * because setting a timer moves the object's alarm to the earliest due time.
 * Waking is safe to repeat: one run has one `watchdog` timer, and the engine
 * ignores a timer that finds nothing to do.
 *
 * A sweep checks at most `maxRunsPerSweep` runs, to stay under the limit on calls of one
 * invocation. It takes them in turn: the runs, in the order of their ids, are cut into
 * groups of that size and the group is chosen by the minute, so every run is checked every
 * few minutes and none is starved. The turn needs no memory between sweeps.
 */
export class Watchdog {
  readonly #options: WatchdogOptions;

  constructor(options: WatchdogOptions) {
    this.#options = options;
  }

  async sweep(): Promise<WatchdogReport> {
    const listed = await this.#options.runs.list({ status: ["running", "waiting"] });
    const candidates = this.#thisSweep(listed);
    const report: WatchdogReport = {
      woken: [],
      failed: [],
      deferred: listed.length - candidates.length,
    };
    for (let start = 0; start < candidates.length; start += runsAtOnce) {
      const batch = candidates.slice(start, start + runsAtOnce);
      await Promise.all(batch.map((run) => this.#check(run.id, run.status, report)));
    }
    return report;
  }

  /** The group of runs this minute's sweep checks. */
  #thisSweep<Run extends { id: string }>(listed: readonly Run[]): Run[] {
    const size = this.#options.maxRunsPerSweep ?? defaultMaxRunsPerSweep;
    const runs = [...listed].sort((a, b) => a.id.localeCompare(b.id, "en"));
    const groups = Math.ceil(runs.length / size);
    const minute = Math.floor(this.#options.clock.now().getTime() / 60_000);
    const start = groups === 0 ? 0 : (minute % groups) * size;
    return runs.slice(start, start + size);
  }

  async #check(runId: string, status: RunStatus, report: WatchdogReport): Promise<void> {
    const { scheduler, clock } = this.#options;
    try {
      const nowMs = clock.now().getTime();
      const health = await scheduler.health(runId);
      const reason = whyStuck(status, health, nowMs, {
        quietAfterMs: this.#options.quietAfterMs ?? defaultQuietAfterMs,
        overdueAfterMs: this.#options.overdueAfterMs ?? defaultOverdueAfterMs,
      });
      if (reason === null) return;
      await scheduler.schedule(runId, watchdogTimerId, new Date(nowMs).toISOString());
      report.woken.push({ runId, reason });
    } catch (error) {
      report.failed.push({
        runId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }
}
