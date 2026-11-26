/**
 * Whether a reviewer can review now (HAL-19203), from their newest runs as
 * Paperclip records them. A reviewer is limited while a run of theirs is
 * parked on a pool wait (no AI seat free for them), or after a seat or usage
 * limit stopped one until a run of theirs starts again or the limit resets
 * (HAL-19254). Rules only, no I/O; `src/plugin/reviewer-runs.ts` reads the runs.
 */

import { resetTimeOf } from "./limit-reset.ts";

/** One run, with only the fields the rules read. Times are ISO strings. */
export interface RunRow {
  readonly status: string;
  /** Why Paperclip scheduled the run for later, such as `ai_connection_pool_wait`. */
  readonly scheduledRetryReason: string | null;
  /** Why the run stopped, such as `provider_limit_wait`. */
  readonly errorCode: string | null;
  /** The run's error message: a limit stop's names when the limit resets. */
  readonly error: string | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

/** Why a reviewer can't review now, and since when. */
export interface Limit {
  readonly why: "pool wait" | "usage limit";
  readonly since: string;
}

/**
 * What the pass knows about a reviewer, by their agent id: limited, free
 * (undefined), or unknown when their runs couldn't be read.
 */
export type ReviewerLimits = (agentId: string) => Promise<Limit | undefined | "unknown">;

/** The retry reason of a run waiting for a free AI seat. */
const poolWait = "ai_connection_pool_wait";

/** The stop codes of a run that hit a seat or usage limit. */
const limitCodes: ReadonlySet<string> = new Set(["provider_limit_wait", "provider_quota"]);

/**
 * How long a limit stop counts when no run started since and its message
 * names no reset time: a usage window is 5 hours.
 */
export const limitWindowMs = 5 * 60 * 60 * 1000;

/** A run parked until a seat frees up: still scheduled, for a pool wait. */
function parkedOnPool(run: RunRow): boolean {
  return run.status === "scheduled_retry" && run.scheduledRetryReason === poolWait;
}

function stoppedAt(run: RunRow): string {
  return run.finishedAt ?? run.createdAt;
}

/** The newest run stopped by a limit, if any. */
function newestLimitStop(runs: readonly RunRow[]): RunRow | undefined {
  return runs
    .filter((run) => run.errorCode !== null && limitCodes.has(run.errorCode))
    .reduce<RunRow | undefined>(
      (newest, run) => (newest === undefined || stoppedAt(run) > stoppedAt(newest) ? run : newest),
      undefined,
    );
}

/** Whether a run of theirs started after `at`: the seat works again. */
function startedSince(runs: readonly RunRow[], at: string): boolean {
  return runs.some((run) => run.startedAt !== null && run.startedAt > at);
}

/** Why a reviewer with these runs can't review at `now`, or undefined when they can. */
export function limitOf(runs: readonly RunRow[], now: Date): Limit | undefined {
  // A parked run whose agent started another since got a seat after all.
  const parked = runs
    .filter((run) => parkedOnPool(run) && !startedSince(runs, run.createdAt))
    .map((run) => run.createdAt)
    .sort()[0];
  if (parked !== undefined) {
    return { why: "pool wait", since: parked };
  }
  const stop = newestLimitStop(runs);
  if (stop === undefined) {
    return undefined;
  }
  const at = stoppedAt(stop);
  if (startedSince(runs, at)) {
    return undefined;
  }
  // Nothing may start a run of theirs once their reviews have moved away, so
  // the limit ends by the clock: at the recorded reset, or after the window.
  const until = resetTimeOf(stop.error, at) ?? Date.parse(at) + limitWindowMs;
  return now.getTime() < until ? { why: "usage limit", since: at } : undefined;
}
