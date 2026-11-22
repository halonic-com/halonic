// Which child run a run failed with (HAL-15555). A `workflow` or `foreach`
// step whose child run fails ends its own run with a plain `error`; only a
// budget stop goes up as it is. The child's own log holds the cause, and the
// model it called, so the CLI and Studio read the child to say why.

import type { RunEvent } from "@halonicjs/events";

/** The child run a failed run's step failed with. */
export interface FailedChild {
  /** The child's full run id. */
  readonly runId: string;
  /** The step of the parent that started it. */
  readonly state: string;
  /** The item of a for-each step it ran for, 0-based; `undefined` for a `workflow` step. */
  readonly item: number | undefined;
}

/**
 * The child run a run failed with: the last child that failed in the step
 * the run failed in (requirement `app.failed-child-run`). A run that ended
 * for a reason of its own, a budget stop or a cancel, failed with none, and
 * so did a run whose step failed without a failed child, such as a for-each
 * whose item's run waited.
 *
 * @example
 * failedChildOf(events);
 * // { runId: "run_a1.4.1", state: "each", item: 1 }
 */
export function failedChildOf(events: readonly RunEvent[]): FailedChild | undefined {
  const failed = events.findLast((event) => event.type === "run.failed");
  if (failed === undefined || (failed.reason !== undefined && failed.reason !== "error")) {
    return undefined;
  }
  const finished = events.findLast(
    (event) => event.type === "workflow.finished" && event.status === "failed",
  );
  if (finished?.type !== "workflow.finished" || finished.state !== failed.state) {
    return undefined;
  }
  return { runId: finished.childRunId, state: finished.state, item: finished.item };
}
