/**
 * The judgement a `check` step that names `changedAfterStart` gets once it has succeeded
 * (`action-steppers.changed-after-start-run`): the kept time must be later than when this
 * stepper opened the guided step's page, such as a secret's `updated_at` after the user typed it
 * on GitHub's own page. Like the `expect` stop, it works from the request's record alone, so a
 * request opened again judges the same way.
 */
import { checkChangedAfterStart, type StepperDefinition } from "@halonicjs/action-steppers";
import type { ActionKeptValue, ActionRecordEvent } from "@halonicjs/events";
import type { StepOutcome, StepperView } from "../stepper-view.ts";

/** Shown when the record has no page the stepper opened before the check, so nothing to compare with. */
export const noStartMessage = "Open the page from this stepper first, then check again.";

/** Shown when the user marked such a check done by hand: it read nothing, so there's no time to judge. */
export const byHandMessage =
  "Halonic has to read this on the service, so it can't be marked done by hand. Run the check instead.";

/**
 * A check that doesn't count as done, with the message the stepper shows. `reopen`: the guided
 * step whose page the stepper never opened, such as one the user marked done by hand, which shows
 * as to do again so the user can open its page from here.
 */
export interface UnchangedCheck {
  readonly message: string;
  readonly reopen: number | undefined;
}

/**
 * The `check` steps whose last run succeeded but whose `changedAfterStart` field isn't later than
 * the start, or that the user marked done by hand. Such a check doesn't count as done.
 */
export function unchangedChecks(
  definition: StepperDefinition,
  events: readonly ActionRecordEvent[],
): ReadonlyMap<number, UnchangedCheck> {
  const unchanged = new Map<number, UnchangedCheck>();
  definition.steps.forEach((step, index) => {
    if (step.kind !== "check" || step.changedAfterStart === undefined) return;
    const number = index + 1;
    const guided = guidedStepBefore(definition, number);
    const judged = lastSuccess(events, guided, number);
    if (judged === undefined) return;
    const reopen = firstOpening(events, guided) === undefined ? guided : undefined;
    const message = judgement(judged, step.changedAfterStart);
    if (message !== undefined) unchanged.set(number, { message, reopen });
  });
  return unchanged;
}

/**
 * The view with each unchanged check failed with its message, whatever its read answered, so it
 * isn't done and the run bar offers it again once the user has saved; a guided page it needs and
 * the stepper never opened is to do again.
 */
export function withJudgement(
  view: StepperView,
  unchanged: ReadonlyMap<number, UnchangedCheck>,
): StepperView {
  const reopen = new Set([...unchanged.values()].map((check) => check.reopen));
  const steps = view.steps.map((step) => {
    const message = unchanged.get(step.number)?.message;
    let outcome: StepOutcome = step.outcome;
    if (message !== undefined) outcome = { kind: "failed", message };
    else if (reopen.has(step.number)) outcome = { kind: "pending" };
    return { ...step, outcome };
  });
  return { ...view, steps };
}

/**
 * The steps the answer lists as failed with `state-changed`: each unchanged check, and the step a
 * stop didn't send. An unchanged check can be that step too, so each is listed once.
 */
export function answeredAsChanged(
  unchanged: ReadonlyMap<number, UnchangedCheck>,
  changedAt: number | undefined,
): number[] {
  const steps = [...unchanged.keys()];
  if (changedAt !== undefined && !steps.includes(changedAt)) steps.push(changedAt);
  return steps;
}

/** Why the check doesn't count, or `undefined` when its time is later than the start. */
function judgement(judged: CheckSuccess, field: string): string | undefined {
  if (judged.byHand) return byHandMessage;
  if (judged.startedAt === undefined) return noStartMessage;
  const result = checkChangedAfterStart(judged.kept, field, judged.startedAt);
  return result.ok ? undefined : result.message;
}

/** A check's last success: what it kept, whether the user marked it by hand, and the start before it. */
interface CheckSuccess {
  readonly kept: Readonly<Record<string, ActionKeptValue>>;
  readonly byHand: boolean;
  readonly startedAt: string | undefined;
}

/** The number of the nearest `guided` step before step `check`, whose page the user changes things on. */
function guidedStepBefore(definition: StepperDefinition, check: number): number | undefined {
  for (let number = check - 1; number >= 1; number -= 1) {
    if (definition.steps[number - 1]?.kind === "guided") return number;
  }
  return undefined;
}

/**
 * What step `check` kept when it last succeeded, with the time the guided step's page first opened
 * before then. `undefined` when the check's last event isn't a success.
 */
function lastSuccess(
  events: readonly ActionRecordEvent[],
  guided: number | undefined,
  check: number,
): CheckSuccess | undefined {
  let judged: CheckSuccess | undefined;
  events.forEach((event, index) => {
    if (!("step" in event) || event.step !== check) return;
    if (event.type !== "action.step.succeeded") {
      judged = undefined;
      return;
    }
    const startedAt = firstOpening(events.slice(0, index), guided);
    // Without a status Studio sent nothing: the user marked it done by hand.
    judged = { kept: event.kept, byHand: event.status === undefined, startedAt };
  });
  return judged;
}

/**
 * When the guided step's page first opened: the `at` Studio's own clock gave the
 * `action.step.started` it recorded, never a value from the request or the definition. A start
 * the shell refused right after opened no page, so it doesn't count.
 */
function firstOpening(
  events: readonly ActionRecordEvent[],
  guided: number | undefined,
): string | undefined {
  const opened: string[] = [];
  for (const event of events) {
    if (!("step" in event) || event.step !== guided) continue;
    if (event.type === "action.step.started") opened.push(event.at);
    else if (event.type === "action.step.failed") opened.pop();
  }
  return opened[0];
}
