import { type AttemptStep, countChangedLines, turnStepTool } from "./attempt-step.ts";
import { type DetectorResult, scoreIfCalibrated, type WriterSetup } from "./calibration.ts";
import { calibratedOn, endOfRunModel } from "./coefficients.ts";
import { type FeatureValues, type LogisticModel, scoreWith } from "./logistic-model.ts";

/** What is known about a writer attempt once it stops, before any check runs. */
export interface FinishedAttempt {
  /** The attempt's steps from the writer's event stream. */
  readonly steps: readonly AttemptStep[];
  /** The agent, model and provider it ran on. */
  readonly setup: WriterSetup;
  /** The attempt's diff against its base commit. */
  readonly diff: string;
  /** Wall seconds from start to stop. */
  readonly seconds: number;
  readonly exitCode: number;
  readonly timedOut: boolean;
  /** The harness reported the attempt as an error. */
  readonly isError?: boolean;
  /** Length of the task prompt in characters. */
  readonly promptChars: number;
  /** The expected diff size in lines, when a scout estimated it; 50 otherwise, as in training. */
  readonly expectedDiffLines?: number;
}

/** Tools the end-of-run detector counts, by the harness's own names. */
const countedTools = ["shell", "read", "edit", "write", "grep"] as const;

const defaultExpectedDiffLines = 50;

/**
 * The end-of-run numbers the detector reads (variant-router `detector_scores.py`
 * and `live_detector.py`). Never the check result, hidden tests or failure reasons.
 * Every number is here; the model picks the ones it was trained on.
 */
export function endOfRunFeatures(attempt: Omit<FinishedAttempt, "setup">): FeatureValues {
  const toolCounts = countTools(attempt.steps);
  const changedLines = countChangedLines(attempt.diff);
  const expected = attempt.expectedDiffLines ?? defaultExpectedDiffLines;
  const edits = (toolCounts.get("edit") ?? 0) + (toolCounts.get("write") ?? 0);
  const values: Record<string, number> = {
    turns: countTurns(attempt.steps),
    changed_lines: changedLines,
    agent_seconds: attempt.seconds,
    timed_out: attempt.timedOut ? 1 : 0,
    exit_nonzero: attempt.exitCode !== 0 || attempt.isError ? 1 : 0,
    is_error: attempt.isError ? 1 : 0,
    no_edit: edits === 0 ? 1 : 0,
    diff_vs_est: Math.log((changedLines + 1) / Math.max(1, expected)),
    prompt_chars: attempt.promptChars,
  };
  for (const tool of countedTools) values[tool] = toolCounts.get(tool) ?? 0;
  return values;
}

/**
 * Scores a finished attempt; `flagged` means retry (or don't ship) it. Refuses
 * an attempt from a setup other than the one the model was fitted on.
 */
export function scoreFinishedAttempt(
  attempt: FinishedAttempt,
  model: LogisticModel = endOfRunModel,
  modelSetup: WriterSetup = calibratedOn,
): DetectorResult {
  return scoreIfCalibrated(attempt.setup, modelSetup, () =>
    scoreWith(model, endOfRunFeatures(attempt)),
  );
}

function countTurns(steps: readonly AttemptStep[]): number {
  return new Set(steps.map((step) => step.step)).size;
}

function countTools(steps: readonly AttemptStep[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const step of steps) {
    if (step.tool === turnStepTool) continue;
    counts.set(step.tool, (counts.get(step.tool) ?? 0) + 1);
  }
  return counts;
}
