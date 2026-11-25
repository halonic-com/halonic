/**
 * What the stepper says, and where focus goes, when its view changes (`action-steppers.results`).
 * By then the pressed control has often gone, and a line that appears already holding its words
 * is often not read, so both are worked out by comparing the view before with the view after.
 */
import {
  isDone,
  nextStep,
  type StepOutcome,
  type StepperStage,
  type StepperView,
  type StepView,
} from "../stepper-view.ts";
import { missingPermissionText, outcomeText, signInWords, stageText } from "./stepper-words.ts";

/** Whether an outcome is a step's result, said once it arrives; "Running…" is not. */
function isResult(outcome: StepOutcome): boolean {
  return outcome.kind !== "pending" && outcome.kind !== "running";
}

/** Whether the step has a result it didn't have before: a new kind, not new words for the same one. */
function isNewResult(step: StepView, was: StepView | undefined): boolean {
  if (!isResult(step.outcome)) return false;
  return was === undefined || was.outcome.kind !== step.outcome.kind;
}

/** The step with the same number in `view`, the step as it was before the change. */
function sameStep(view: StepperView, step: StepView): StepView | undefined {
  return view.steps.find((candidate) => candidate.number === step.number);
}

/** The device code GitHub gave, when the stage shows one. */
function gitHubCode(stage: StepperStage): string | null {
  return stage.kind === "sign-in" && stage.signIn.service === "github" ? stage.signIn.code : null;
}

/** The line a stage says once the request reaches it: its own line, or the missing permission. */
function stageResult(view: StepperView): string | null {
  const stage = view.stage;
  if (stage.kind === "missing-permission") {
    return missingPermissionText(view.service, view.account, stage.permission);
  }
  return stageText(stage);
}

/**
 * The words for the stepper's status region: each step result the change brought, in step order,
 * then the new stage's line, then GitHub's waiting line once its code shows. `null` when the change
 * brought nothing to say, such as a step that started running.
 */
export function resultText(before: StepperView, after: StepperView): string | null {
  const said: string[] = [];
  for (const step of after.steps) {
    const text = outcomeText(step.outcome, after.service);
    if (text !== null && isNewResult(step, sameStep(before, step))) said.push(text);
  }
  if (after.stage.kind !== before.stage.kind) {
    const line = stageResult(after);
    if (line !== null) said.push(line);
  }
  const code = gitHubCode(after.stage);
  if (code !== null && code !== gitHubCode(before.stage)) said.push(signInWords.githubWaiting);
  return said.length === 0 ? null : said.join(" ");
}

/** Where focus goes when a change took away the control that had it. */
export type FocusTarget =
  /** The request's title, which opens every stage. */
  | { readonly kind: "title" }
  /** GitHub's device code, the next thing to read after **Sign in to GitHub**. */
  | { readonly kind: "sign-in-code" }
  /** The first control of a browser step that is next, such as **Open the page**. */
  | { readonly kind: "step-controls"; readonly number: number }
  /** The line that says how a step went, such as "Checked: …". */
  | { readonly kind: "step-outcome"; readonly number: number };

/**
 * Where focus goes after a change: the title when the stage changed (the last step finished, the
 * user declined, the sign-in ended); the code once GitHub's sign-in started; after a step was
 * done, the next browser step's first control, or else the done step's own line.
 */
export function focusTarget(before: StepperView, after: StepperView): FocusTarget {
  if (after.stage.kind !== before.stage.kind) return { kind: "title" };
  if (gitHubCode(after.stage) !== null) return { kind: "sign-in-code" };
  const done = after.steps.find((step) => {
    const was = sameStep(before, step);
    return isDone(step) && (was === undefined || !isDone(was));
  });
  if (done === undefined) return { kind: "title" };
  const next = nextStep(after);
  if (next?.action.kind === "browser") return { kind: "step-controls", number: next.number };
  return { kind: "step-outcome", number: done.number };
}

/**
 * The attribute value that marks each {@link FocusTarget} other than the title in the page. A
 * step's own targets sit inside its list item, which carries `data-step` with its number.
 */
export const focusMarks = {
  signInCode: "sign-in-code",
  stepControls: "step-controls",
  stepOutcome: "step-outcome",
} as const;

/**
 * The element a target names inside the stepper, or `null` for the title, which the stepper holds
 * itself, and when the page doesn't show the target.
 */
export function findTarget(within: HTMLElement, target: FocusTarget): HTMLElement | null {
  switch (target.kind) {
    case "title":
      return null;
    case "sign-in-code":
      return within.querySelector(`[data-focus="${focusMarks.signInCode}"]`);
    case "step-controls":
      return within.querySelector(
        `[data-step="${target.number}"] [data-focus="${focusMarks.stepControls}"] button`,
      );
    case "step-outcome":
      return within.querySelector(
        `[data-step="${target.number}"] [data-focus="${focusMarks.stepOutcome}"]`,
      );
  }
}

/** Whether focus fell to the page: the control that had it went away. */
export function focusLost(): boolean {
  return document.activeElement === null || document.activeElement === document.body;
}
