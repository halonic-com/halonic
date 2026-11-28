/**
 * Reads a request's record back (`action-steppers.run`): how each step stands, how the request
 * ended, and the answer the requester gets. The record is the one place the stepper keeps this,
 * so a request opened again resumes where it stopped (HAL-17491 6.3).
 */
import type {
  ActionOutcome,
  ActionRecordEvent,
  ActionStepFailedEvent,
  ActionStepFailure,
} from "@halonicjs/events";
import type { ActionResultAnswer, ActionResultStep } from "@halonicjs/ports";
import type { StepOutcome } from "../stepper-view.ts";

type StepEvent = Extract<
  ActionRecordEvent,
  {
    type:
      | "action.step.started"
      | "action.step.succeeded"
      | "action.step.failed"
      | "action.step.skipped";
  }
>;

/** What the record says about a request: each step's last event and, once it ended, how. */
export interface RecordState {
  readonly steps: ReadonlyMap<number, StepEvent>;
  readonly finished: ActionOutcome | undefined;
}

/** Folds a record, oldest first, into each step's last event and the request's end. */
export function foldRecord(events: readonly ActionRecordEvent[]): RecordState {
  const steps = new Map<number, StepEvent>();
  let finished: ActionOutcome | undefined;
  for (const event of events) {
    if (event.type === "action.finished") finished = event.outcome;
    else if ("step" in event) steps.set(event.step, event);
  }
  return { steps, finished };
}

/** The failure in plain words, when the service gave no message of its own. */
const failureWords: Readonly<Record<ActionStepFailure, string>> = {
  "service-error": "The service gave no reason.",
  refused: "Halonic didn't send it: it doesn't match the reviewed step.",
  unreachable: "The service didn't answer.",
  malformed: "Its values no longer fit the reviewed step.",
  "state-changed": "What the requester saw has changed since they asked.",
  "more-than-one": "The service found more than one match, and this step works on exactly one.",
};

/** How the step the stepper didn't send shows, once its check read a state the requester didn't see. */
export const stateChangedOutcome: StepOutcome = {
  kind: "failed",
  message: failureWords["state-changed"],
};

/** A failure with the service's own message quotes it with the status; otherwise it says why in Halonic's words. */
function failedOutcome(event: ActionStepFailedEvent): StepOutcome {
  if (event.error !== undefined) {
    return { kind: "failed", status: event.status, message: event.error };
  }
  const status = event.status === undefined ? "" : ` (status ${event.status})`;
  return { kind: "failed", message: `${failureWords[event.failure]}${status}` };
}

/**
 * How a step shows. A step that only started is pending again: the user cancelled the shell's
 * dialog, or opened a guided step's page and hasn't said it's done.
 */
export function stepOutcome(event: StepEvent | undefined): StepOutcome {
  switch (event?.type) {
    case "action.step.succeeded":
      return { kind: "succeeded" };
    case "action.step.failed":
      return failedOutcome(event);
    case "action.step.skipped":
      return { kind: "skipped" };
    default:
      return { kind: "pending" };
  }
}

/** One step's line in the answer, or `undefined` for a step that never ended. */
function resultStep(
  event: StepEvent,
  secretSetOn: string | undefined,
): ActionResultStep | undefined {
  switch (event.type) {
    case "action.step.succeeded": {
      const step: ActionResultStep = { step: event.step, outcome: "succeeded" };
      // Without a status the user did it themselves, on the page or by hand.
      if (event.status === undefined) step.byHand = true;
      else step.status = event.status;
      // For a secret only when it was set: its value stayed in the shell's dialog.
      const kept = secretSetOn === undefined ? event.kept : { ...event.kept, secret: secretSetOn };
      if (Object.keys(kept).length > 0) step.kept = kept;
      return step;
    }
    case "action.step.failed": {
      const step: ActionResultStep = {
        step: event.step,
        outcome: "failed",
        failure: event.failure,
      };
      if (event.status !== undefined) step.status = event.status;
      if (event.error !== undefined) step.error = { untrusted: true, text: event.error };
      return step;
    }
    case "action.step.skipped":
      return { step: event.step, outcome: "skipped" };
    default:
      return undefined;
  }
}

/**
 * The `action-result` answer for a request that ended with `outcome` (HAL-17491 1.3, step 5): each
 * step that ended, in order, with its status and kept fields. A step in `secretSteps` says only
 * "set on <day>". Declined and expired requests list no steps, as the answer's check demands.
 *
 * @param day - the day the stepper ended, such as "25 Nov 2026", from the injected clock
 * @param stateChanged - the steps listed as failed with `state-changed` instead of what the record
 *   says: the step the stepper didn't send because its check read a state other than the
 *   requester's `expect`, and a check whose `changedAfterStart` time isn't after the start
 */
export function resultAnswer(
  state: RecordState,
  outcome: ActionOutcome,
  secretSteps: ReadonlySet<number>,
  day: string,
  stateChanged: readonly number[] = [],
): ActionResultAnswer {
  if (outcome === "declined" || outcome === "expired")
    return { kind: "action-result", outcome, steps: [] };
  const steps: ActionResultStep[] = [...state.steps.values()]
    .filter((event) => !stateChanged.includes(event.step))
    .flatMap(
      (event) => resultStep(event, secretSteps.has(event.step) ? `set on ${day}` : undefined) ?? [],
    );
  for (const step of stateChanged)
    steps.push({ step, outcome: "failed", failure: "state-changed" });
  steps.sort((first, second) => first.step - second.step);
  return { kind: "action-result", outcome, steps };
}

/**
 * How a request ends when the user stops it: declined when nothing ran, failed when some steps
 * did, since a declined answer may list no steps.
 */
export function stoppedOutcome(state: RecordState): ActionOutcome {
  const ran = [...state.steps.values()].some((event) => event.type !== "action.step.started");
  return ran ? "failed" : "declined";
}

/** The day as the answer says it, such as "25 Nov 2026", in UTC so every machine says the same. */
export function answerDay(now: Date): string {
  return now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
