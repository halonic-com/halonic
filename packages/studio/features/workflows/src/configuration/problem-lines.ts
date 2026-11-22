import type { WorkflowProblem } from "../api.ts";

/** The glyph before a problem: ✕ for an error, △ for a warning, so colour is never the only sign. */
export const problemGlyph = { error: "✕", warning: "△" } as const;

/**
 * The short line of each check, for a step card (HAL-413); its tooltip and Configuration › Problems
 * carry the core's full message. It starts with a capital, leaves out the step's name (the card
 * shows it) and is about 25 characters.
 */
const stepLines: Readonly<Record<string, string>> = {
  "unknown-target": "Goes to a missing step",
  "dead-end": "Has no way out",
  "unknown-gets": "Gets data not written yet",
  "unknown-template-name": "Uses data not written yet",
  "timer-outside-wait": "Timers only work in Wait",
  "timer-with-event": "Has a timer and an event",
  "foreach-without-items": "Has no list to go over",
  "foreach-without-work": "Needs agent or workflow",
  "self-subflow": "Runs its own workflow",
  "unknown-workflow": "Runs a missing workflow",
  "workflow-without-target": "Has no workflow to run",
  "parallel-without-branches": "Has no branches",
  "unknown-agent": "Uses a missing agent",
  "final-has-transitions": "Is an end, but has arrows",
  "task-without-agent": "Has no agent",
  "wait-without-events": "Has no answers to pick",
  "unguarded-shadow": "Never taken",
  "not-a-choice": "Compares with a non-option",
  "ignored-key": "Has a key it ignores",
  "unknown-item-name": "Uses a name its items lack",
  "items-not-a-list": "Its items aren't a list",
  "no-done-transition": "Never moves on when done",
  unreachable: "Can't be reached",
};

/**
 * The sentence of Configuration › Problems for a step's check, in Studio's words where the core's
 * message speaks the file's (`agent: <id>`, "transitions", "final"). A newly added step gets these
 * checks, so they are the first problems a person meets (C544, HAL-15120). It leaves out the step's
 * name: the row's link names it.
 */
const rowSentences: Readonly<Record<string, string>> = {
  "task-without-agent":
    "Has no agent, so every run fails here. Pick one on its card, or make it a Wait.",
  "dead-end": "Has no way out. Add an arrow from it on its card, or make it an End.",
  unreachable: "Can't be reached: no arrow leads to it.",
  "wait-without-events":
    "Gives a person no answers to pick, such as approve. Add them in the workflow's file.",
};

/** The sentence of a check that is about the whole workflow, not one step. */
const stripLines: Readonly<Record<string, string>> = {
  "missing-initial": "This workflow has no first step.",
  "no-final": "This workflow has no end step.",
};

/**
 * The checks whose problem is about one of a step's arrows. Flow-workflows 4.4 marks them on the
 * arrow's label plate, not on the step's card.
 */
const arrowChecks: ReadonlySet<string> = new Set(["unknown-target", "unguarded-shadow"]);

/**
 * How Studio names a step: as its card on the canvas does, by its title, or by its id when it has
 * none. The file and `halonic validate` keep the id.
 */
export type StepNames = (stepId: string) => string;

/** Names every step by its id, for a page that doesn't know the steps' titles yet. */
const byId: StepNames = (stepId) => stepId;

/** One line of Configuration › Problems. */
export interface ProblemRow {
  readonly severity: WorkflowProblem["severity"];
  readonly glyph: string;
  /** What the row says: Studio's sentence for the check, or the core's full message when none is written. */
  readonly text: string;
  /** The step it is about, which the row links to; absent for a problem of the whole workflow. */
  readonly stepId?: string | undefined;
  /** The step's name as its card shows it, which the row's link reads; absent with `stepId`. */
  readonly stepName?: string | undefined;
}

/**
 * The core's full message, with its step named as the card names it: the core quotes the step's id
 * (`"first" uses unknown agent "nobody-here"`), Studio its title (`"Ask a missing agent" uses …`).
 * Only the first quoted id is the step's own: a later one can be an agent or a step it goes to.
 */
export function namedMessage(problem: WorkflowProblem, nameOf: StepNames = byId): string {
  if (problem.stepId === undefined) return problem.message;
  const name = nameOf(problem.stepId);
  if (name === problem.stepId) return problem.message;
  // A function, so a `$` in the name is kept as it is, not read as a replacement pattern.
  return problem.message.replace(`"${problem.stepId}"`, () => `"${name}"`);
}

/** The short line for a problem, without its glyph; the core's own message when no line is written for it. */
export function problemLine(problem: WorkflowProblem): string {
  const sentence = stripLines[problem.code];
  if (sentence !== undefined) return sentence;
  return stepLines[problem.code] ?? problem.message;
}

/** The problems errors first, each group in the file's order. */
function errorsFirst(problems: readonly WorkflowProblem[]): readonly WorkflowProblem[] {
  const errors = problems.filter((problem) => problem.severity === "error");
  const warnings = problems.filter((problem) => problem.severity === "warning");
  return [...errors, ...warnings];
}

/** The problems as rows: errors first, each group in the file's order, each step by its name. */
export function problemRows(
  problems: readonly WorkflowProblem[],
  nameOf: StepNames = byId,
): readonly ProblemRow[] {
  return errorsFirst(problems).map((problem) => {
    return {
      severity: problem.severity,
      glyph: problemGlyph[problem.severity],
      text: rowSentences[problem.code] ?? namedMessage(problem, nameOf),
      stepId: problem.stepId,
      stepName: problem.stepId === undefined ? undefined : nameOf(problem.stepId),
    };
  });
}

/** What a step's card shows of its problems (flow-workflows 4.4). */
export interface CardProblems {
  /** An error rings the card in danger; warnings alone, in attention. */
  readonly severity: WorkflowProblem["severity"];
  /** The glyph before the line: ✕ when any is an error, else △. */
  readonly glyph: string;
  /**
   * The problem line after its glyph: the first problem's own line, "Uses a missing agent". A card
   * shows one problem; the Problems list counts them (HAL-15171).
   */
  readonly line: string;
  /** The line's tooltip: each problem's full message, errors first, one per line. */
  readonly detail: string;
}

/**
 * What the step's card shows of the workflow's problems: those about the step itself, not about one
 * of its arrows. `undefined` when the step has none.
 */
export function cardProblems(
  problems: readonly WorkflowProblem[],
  stepId: string,
  nameOf: StepNames = byId,
): CardProblems | undefined {
  const own = errorsFirst(
    problems.filter((problem) => problem.stepId === stepId && !arrowChecks.has(problem.code)),
  );
  const [first] = own;
  if (first === undefined) return undefined;
  return {
    severity: first.severity,
    glyph: problemGlyph[first.severity],
    line: problemLine(first),
    detail: own.map((problem) => namedMessage(problem, nameOf)).join("\n"),
  };
}

/** How many errors and warnings there are. */
export function countProblems(problems: readonly WorkflowProblem[]): {
  readonly errors: number;
  readonly warnings: number;
} {
  const errors = problems.filter((problem) => problem.severity === "error").length;
  return { errors, warnings: problems.length - errors };
}

/**
 * What several problems on one card say: "✕ 2 problems" when any is an error, "△ 2 warnings" when
 * all are warnings; one problem says its own line. Empty when there are none.
 */
export function cardSummary(problems: readonly WorkflowProblem[]): string {
  if (problems.length === 0) return "";
  const { errors } = countProblems(problems);
  return `${problemGlyph[errors > 0 ? "error" : "warning"]} ${summaryWords(problems)}`;
}

/** {@link cardSummary} without its glyph: one problem's own line, or how many there are. */
function summaryWords(problems: readonly WorkflowProblem[]): string {
  const [only] = problems;
  if (only !== undefined && problems.length === 1) return problemLine(only);
  const { errors } = countProblems(problems);
  return errors > 0 ? `${problems.length} problems` : `${problems.length} warnings`;
}
