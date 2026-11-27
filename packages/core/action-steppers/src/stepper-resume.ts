import type { ApiStep, ManualForm, Step } from "./stepper-types.ts";

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
 * it on the page. A sign-in with any part left runs again from its first
 * part, because its key and its code lived only while the stepper was open. A failed API step has no `check` yet to show whether it
 * happened, so the stepper stops there rather than repeat it.
 *
 * @example
 * planResume(steps, new Map([[1, "succeeded"], [2, "failed"]]));
 * // => { kind: "run", steps: [1, 2] } when step 1 is an `input` and step 2 is `guided`
 */
export function planResume(
  steps: readonly Step[],
  outcomes: ReadonlyMap<number, StepOutcome>,
): ResumePlan {
  const firstLeft = steps.findIndex((step, index) => !isDone(step, outcomes.get(index + 1)));
  if (firstLeft === -1) return { kind: "finished" };

  // Any failed API step, not just the first step left: an earlier failed
  // guided step must not carry a failed API step along into the run.
  const failedApiIndex = steps.findIndex(
    (step, index) => isApiStep(step) && outcomes.get(index + 1) === "failed",
  );
  const failedApi = steps[failedApiIndex];
  if (failedApi !== undefined && isApiStep(failedApi)) {
    return {
      kind: "stop",
      step: failedApiIndex + 1,
      reason: "may-have-happened",
      manual: failedApi.manual,
    };
  }

  // A sign-in holds its key only while the stepper is open (6.7): if any part is left, it starts again at its first part.
  const signInLeft = steps.some(
    (step, index) => step.kind === "sign-in" && !isDone(step, outcomes.get(index + 1)),
  );
  const toRun: number[] = [];
  steps.forEach((step, index) => {
    const isInput = step.kind === "input";
    const isSignIn = signInLeft && step.kind === "sign-in";
    const isLeft = index >= firstLeft && !isDone(step, outcomes.get(index + 1));
    if (isInput || isSignIn || isLeft) toRun.push(index + 1);
  });
  return { kind: "run", steps: toRun };
}

function isApiStep(step: Step): step is ApiStep {
  return step.kind === "call" || step.kind === "check" || step.kind === "script";
}

/** An `input` step never counts as done on its own: it only matters for the steps after it. */
function isDone(step: Step, outcome: StepOutcome | undefined): boolean {
  if (step.kind === "input") return true;
  return outcome === "succeeded" || outcome === "skipped";
}
