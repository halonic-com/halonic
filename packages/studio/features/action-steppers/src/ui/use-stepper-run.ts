import { useEffect, useState, useSyncExternalStore } from "react";
import { StepperRun } from "../run/stepper-run.ts";
import type { StepperRunOptions } from "../run/stepper-run-options.ts";
import type { StepperActions, StepperView } from "../stepper-view.ts";

/** What {@link useStepperRun} gives the card: the view to draw, its callbacks and the last failure. */
export interface StepperRunState {
  readonly view: StepperView;
  readonly actions: StepperActions;
  /** Why the last callback failed, such as an answer the source didn't take; `undefined` when it worked. */
  readonly failure: unknown;
  /** Does what failed again, for **Try again**. */
  readonly retry: () => void;
  /** Checks the request again, such as once the connections have been read. */
  readonly recheck: () => void;
}

/**
 * Runs one opened action request with a {@link StepperRun} for as long as the card shows it: it
 * reads the record and the sign-in once, and stops a sign-in it started when the card goes.
 *
 * @param reviewed - the request's view in review mode, which the run starts from
 */
export function useStepperRun(reviewed: StepperView, options: StepperRunOptions): StepperRunState {
  // One run per card: the item, its source and the service don't change while it shows. So the
  // run keeps the first `reviewed` view and checks the request again on each click instead.
  const [run] = useState(() => new StepperRun(reviewed, options));
  useSyncExternalStore(run.subscribe, run.changes);
  useEffect(() => {
    void run.open().catch((error: unknown) => run.fail(error));
    return () => void run.close().catch((error: unknown) => run.fail(error));
  }, [run]);
  return {
    view: run.current(),
    actions: run.actions,
    failure: run.failure,
    retry: run.retry,
    recheck: run.recheck,
  };
}
