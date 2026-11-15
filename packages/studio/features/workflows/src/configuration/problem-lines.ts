import type { WorkflowProblem } from "../api.ts";

/** The glyph before a problem: ✕ for an error, △ for a warning, so colour is never the only sign. */
export const problemGlyph = { error: "✕", warning: "△" } as const;

/**
 * The short line of each check, for a step card and for Configuration › Problems (HAL-413). It is
 * lowercase, leaves out the step's name (the card shows it) and is about 25 characters.
 */
const stepLines: Readonly<Record<string, string>> = {
  "unknown-target": "goes to a missing step",
  "dead-end": "has no way out",
  "unknown-gets": "gets data not written yet",
  "timer-outside-wait": "timers only work in Wait",
  "foreach-without-items": "has no list to go over",
  "foreach-without-work": "needs agent or workflow",
  "self-subflow": "runs its own workflow",
  "unknown-workflow": "runs a missing workflow",
  "workflow-without-target": "has no workflow to run",
  "parallel-without-branches": "has no branches",
  "unknown-agent": "uses a missing agent",
  "final-has-transitions": "is an end, but has arrows",
  "task-without-agent": "no agent, passes through",
  "wait-without-events": "has no events to wait for",
  "unguarded-shadow": "never fires",
  unreachable: "can't be reached",
};

/** The sentence of a check that is about the whole workflow, not one step. */
const stripLines: Readonly<Record<string, string>> = {
  "missing-initial": "This workflow has no first step.",
  "no-final": "This workflow has no end step.",
};

/** One line of Configuration › Problems. */
export interface ProblemRow {
  readonly severity: WorkflowProblem["severity"];
  readonly glyph: string;
  /** What the row says: the short line, or the sentence when no step is meant. */
  readonly text: string;
  /** The step it is about, which the row links to; absent for a problem of the whole workflow. */
  readonly stepId?: string | undefined;
  /** "Error" or "Warning", read before the row so colour and glyph are never the only sign. */
  readonly kind: "Error" | "Warning";
}

/** The short line for a problem, without its glyph; the core's own message when no line is written for it. */
export function problemLine(problem: WorkflowProblem): string {
  const sentence = stripLines[problem.code];
  if (sentence !== undefined) return sentence;
  return stepLines[problem.code] ?? problem.message;
}

/** The problems as rows: errors first, each group in the file's order. */
export function problemRows(problems: readonly WorkflowProblem[]): readonly ProblemRow[] {
  const errors = problems.filter((problem) => problem.severity === "error");
  const warnings = problems.filter((problem) => problem.severity === "warning");
  return [...errors, ...warnings].map((problem) => {
    const text = problemLine(problem);
    return {
      severity: problem.severity,
      glyph: problemGlyph[problem.severity],
      text,
      stepId: problem.stepId,
      kind: problem.severity === "error" ? "Error" : "Warning",
    };
  });
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
  const [only] = problems;
  if (only === undefined) return "";
  if (problems.length === 1) return `${problemGlyph[only.severity]} ${problemLine(only)}`;
  const { errors } = countProblems(problems);
  return errors > 0
    ? `${problemGlyph.error} ${problems.length} problems`
    : `${problemGlyph.warning} ${problems.length} warnings`;
}
