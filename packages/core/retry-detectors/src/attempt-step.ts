/**
 * One step of a writer attempt, as the writer's event stream shows it while the
 * attempt runs. Same shape as variant-router's per-step timeline, so the
 * detectors read production attempts the way they were trained.
 */
export interface AttemptStep {
  /** Seconds since the attempt started. */
  readonly t: number;
  /** The model turn this step belongs to, counting from 1. */
  readonly step: number;
  /** The harness's own tool name (`shell`, `read`, `edit`, `write`, `grep`, …), or `(step)` for a turn's token count. */
  readonly tool: string;
  /** Files the tool call read. */
  readonly read?: readonly string[];
  /** Files the tool call changed. */
  readonly edited?: readonly string[];
  /** For `shell`: the command line. */
  readonly command?: string;
  /** For a test or typecheck command: how many tests failed, when its output says. */
  readonly failed?: number;
  /** For `(step)`: the turn's input and output tokens. */
  readonly tokensIn?: number;
  readonly tokensOut?: number;
}

/** The tool name of a step that only carries a turn's token count. */
export const turnStepTool = "(step)";

/**
 * Counts changed lines in a unified diff: `+` and `-` lines inside hunks, so
 * file headers don't count. The same rule as the eval's `countChangedLines`.
 */
export function countChangedLines(diff: string): number {
  let inHunk = false;
  let changed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) inHunk = false;
    else if (line.startsWith("@@")) inHunk = true;
    else if (inHunk && (line.startsWith("+") || line.startsWith("-"))) changed++;
  }
  return changed;
}
