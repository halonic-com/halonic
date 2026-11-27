/**
 * The check a request's `expect` gets once its `check` step has read today's state
 * (`action-steppers.expect-stop`, architecture note on HAL-17491, 6.2). It works from the record
 * alone, so a request opened again stops the same way, and no later step can run from another
 * window once the stop is recorded.
 */
import { checkExpect, type ExpectChange, type StepperDefinition } from "@halonicjs/action-steppers";
import type { ActionKeptValue } from "@halonicjs/events";
import type { InboxActionRequest } from "@halonicjs/ports";
import type { StepOutcome } from "../stepper-view.ts";
import { nextStep, type StepperView } from "../stepper-view.ts";
import { type RecordState, stateChangedOutcome } from "./record-fold.ts";

/** Why the stepper stopped: Halonic's sentence, and each changed value for the screen to show as data. */
export interface ExpectStop {
  /** "This changed since the request: …", naming the changed values, never quoting them. */
  readonly message: string;
  readonly changes: readonly ExpectChange[];
}

/**
 * What the request's `check` steps kept, in step order, or `undefined` while none has succeeded.
 * A check the user marked done by hand kept nothing, so every value it should have read is missing.
 */
export function checkedValues(
  definition: StepperDefinition,
  record: RecordState,
): Readonly<Record<string, ActionKeptValue>> | undefined {
  let current: Record<string, ActionKeptValue> | undefined;
  definition.steps.forEach((step, index) => {
    const event = record.steps.get(index + 1);
    if (step.kind !== "check" || event?.type !== "action.step.succeeded") return;
    current = { ...current, ...event.kept };
  });
  return current;
}

/**
 * Compares the request's `expect` with what its checks kept. `undefined` when the request expects
 * nothing, no check has run yet, or everything still matches; otherwise the stepper stops and sends
 * none of the later steps.
 */
export function expectStop(
  action: InboxActionRequest,
  current: Readonly<Record<string, ActionKeptValue>> | undefined,
): ExpectStop | undefined {
  if (action.expect === undefined || current === undefined) return undefined;
  const result = checkExpect(action.expect, current);
  return result.ok ? undefined : { message: result.message, changes: result.changes };
}

/**
 * The view of a request whose check read a state other than its `expect`: it says what changed,
 * and the next step, which it didn't send, shows as failed with `state-changed`, or with
 * `outcome` when another check stopped it.
 */
export function stoppedView(
  view: StepperView,
  stop: ExpectStop,
  outcome: StepOutcome = stateChangedOutcome,
): StepperView {
  const stopped = nextStep(view)?.number;
  const steps = view.steps.map((step) => (step.number === stopped ? { ...step, outcome } : step));
  return {
    ...view,
    steps,
    stage: { kind: "changed", message: stop.message, changes: stop.changes },
  };
}
