import type { RunRow, SourcedRun } from "@halonicjs/studio-feature-runs/api";
import { stateOf } from "../start/run-strip.ts";
import { runsWords as words } from "./runs-words.ts";

/** What a shown run's log says about one step: the line under the step card's title. */
export interface StepInRun {
  readonly line: string;
  /** Whether the step was reached: only then is there something to see in and out of it. */
  readonly reached: boolean;
}

/**
 * What happened to `stepId` in the run (flow-workflows 4.5, "This step in the run"), from the
 * states the run visited and the one it is in or ended in. A step that ran more than once reads
 * "Ran 3 times"; the step the run stopped in says how it stopped.
 *
 * @example
 * stepInRun("draft", row, run).line; // "✕ Failed here in run 01jd8q"
 */
export function stepInRun(stepId: string, row: RunRow, run: SourcedRun): StepInRun {
  const times = run.summary.statesVisited.filter((visited) => visited === stepId).length;
  const { shortId } = row;
  if (times === 0) return { line: words.stepNotReached(shortId), reached: false };
  const line =
    stateOf(run) === stepId
      ? {
          failed: words.stepFailed(shortId),
          budget: words.stepStopped(shortId),
          cancelled: words.stepCancelled(shortId),
          running: words.stepRunning(shortId),
          "cant-try": words.stepRunning(shortId),
          waiting: words.stepNeedsYou(shortId),
          "needs-you": words.stepNeedsYou(shortId),
          done: ran(times, shortId),
        }[row.standing]
      : ran(times, shortId);
  return { line, reached: true };
}

function ran(times: number, shortId: string): string {
  return times > 1 ? words.stepRanTimes(times, shortId) : words.stepRan(shortId);
}
