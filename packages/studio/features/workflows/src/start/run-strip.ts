import type { RunRow, RunWorkflow, SourcedRun } from "@halonicjs/studio-feature-runs/api";
import { startWords as words } from "./start-words.ts";

/** What the canvas strip says of the run it shows, and the step it rings when the run failed. */
export interface ShownRun {
  readonly runId: string;
  /** The strip's line: "Showing run 01JD8Q · failed in Draft reply". */
  readonly line: string;
  /** The step to ring in danger with its **Failed** chip; only a failed run has one. */
  readonly failedStep: string | undefined;
  /** The steps the run has left behind: the arrows out of them are blue on the canvas. */
  readonly finishedSteps: ReadonlySet<string>;
}

/** The step the run is in, or ended in: the id of the last state it reached. */
export function stateOf(run: SourcedRun): string {
  const { summary } = run;
  return summary.approvals[0]?.state ?? summary.state ?? summary.statesVisited.at(-1) ?? "";
}

/** The step's description's first line, else its id with a capital: how the Runs row names it. */
function stepNameOf(stateId: string, workflow: RunWorkflow | undefined): string {
  const firstLine = workflow?.stepDescription(stateId)?.split("\n")[0]?.trim() ?? "";
  return firstLine !== "" ? firstLine : stateId.charAt(0).toUpperCase() + stateId.slice(1);
}

/**
 * What the strip shows for a run, in the Runs row's words (D8), so the strip, the row and
 * `halonic runs` say the same. A run that needs the person reads as waiting, and a run that can't be tried as running.
 *
 * @example
 * shownRun(row, run, workflow).line; // "Showing run 01jd8q · failed in Draft reply"
 */
export function shownRun(
  row: RunRow,
  run: SourcedRun,
  workflow: RunWorkflow | undefined,
): ShownRun {
  const stateId = stateOf(run);
  const step = stepNameOf(stateId, workflow);
  const { standing } = row;
  const how = {
    done: words.ended.done,
    failed: words.ended.failed(step),
    budget: words.ended.budget(step),
    cancelled: words.ended.cancelled(step),
    running: words.ended.running(step),
    "cant-try": words.ended.running(step),
    waiting: words.ended.waiting(step),
    "needs-you": words.ended.waiting(step),
  }[standing];
  return {
    runId: row.id,
    line: words.strip(row.shortId, how),
    failedStep: standing === "failed" ? stateId : undefined,
    finishedSteps: new Set(
      run.summary.statesVisited.filter((visited) => standing === "done" || visited !== stateId),
    ),
  };
}
