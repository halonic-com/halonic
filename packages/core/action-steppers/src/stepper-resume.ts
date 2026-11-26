import type { ManualForm, Step } from "./stepper-types.ts";

/** What the per-request record says happened to one step. */
export type StepOutcome = "succeeded" | "failed" | "skipped";

/** What "Resume" does next for one request. */
export type ResumePlan =
  /** Run these steps, numbered from 1, in this order. */
  | { kind: "run"; steps: readonly number[] }
  /** Every step is done; nothing is left to run. */
  | { kind: "finished" }
  /**
   * A failed API step that the stepper can't safely run again: it may have
   * happened. The stepper says so and links the service's own page.
   */
  | { kind: "stop"; step: number; reason: "may-have-happened"; manual: ManualForm };

/**
 * Plans what "Resume" runs after a stop (architecture note, 6.3). A step
 * recorded as succeeded or skipped isn't run again. Every `input` step before
 * the first step left is asked again, because its value is never kept and a
 * later step may need it. A failed `guided` step runs again: the user redoes
 * it on the page. A failed API step has no `check` yet to show whether it
 * happened, so the stepper stops there rather than repeat it.
 *
 * @example
 * planResume(steps, new Map([[1, "succeeded"], [2, "failed"]]));
 * // => { kind: "run", steps: [1, 2, 3] } when step 1 is an `input` and step 2 is `guided`
 */
export function planResume(
  steps: readonly Step[],
  outcomes: ReadonlyMap<number, StepOutcome>,
): ResumePlan {
  const firstLeft = steps.findIndex((step, index) => !isDone(step, outcomes.get(index + 1)));
  if (firstLeft === -1) return { kind: "finished" };

  const failed = steps[firstLeft];
  if (failed?.kind === "script" && outcomes.get(firstLeft + 1) === "failed") {
    return {
      kind: "stop",
      step: firstLeft + 1,
      reason: "may-have-happened",
      manual: failed.manual,
    };
  }

  const toRun: number[] = [];
  steps.forEach((step, index) => {
    const isInput = step.kind === "input";
    const isLeft = index >= firstLeft && !isDone(step, outcomes.get(index + 1));
    if (isInput || isLeft) toRun.push(index + 1);
  });
  return { kind: "run", steps: toRun };
}

/** An `input` step never counts as done on its own: it only matters for the steps after it. */
function isDone(step: Step, outcome: StepOutcome | undefined): boolean {
  if (step.kind === "input") return true;
  return outcome === "succeeded" || outcome === "skipped";
}
