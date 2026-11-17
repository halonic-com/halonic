import type { RunRow, RunWorkflow, SourcedRun } from "@halonicjs/studio-feature-runs/api";
import { startWords as words } from "./start-words.ts";

/** How a step stands in the shown run: the colour of its status dot on the canvas. */
export type StepMark = "done" | "running" | "waiting" | "failed" | "stopped";

/** What the canvas strip says of the run it shows, and the step it rings when the run failed. */
export interface ShownRun {
  readonly runId: string;
  /** The strip's line: "Showing run 01JD8Q · failed in Draft reply". */
  readonly line: string;
  /** The step to ring in danger with its **Failed** chip; only a failed run has one. */
  readonly failedStep: string | undefined;
  /** The steps the run went through, in order: the arrows it went along are blue on the canvas. */
  readonly route: readonly string[];
  /** The mark of each step the run reached; a step it never reached has none and no dot. */
  readonly marks: Readonly<Record<string, StepMark>>;
  /** The step the run is in right now, where the point of light rests; absent once it has ended. */
  readonly active: string | undefined;
}

/** The mark of the run's last step by how the run stands; every step before it is done. */
const LAST_MARK: Record<RunRow["standing"], StepMark> = {
  done: "done",
  failed: "failed",
  budget: "stopped",
  cancelled: "stopped",
  running: "running",
  "cant-try": "running",
  waiting: "waiting",
  "needs-you": "waiting",
};

/** Marks for the steps a run visited, in order: the last by the run's standing, the rest done. */
export function marksOf(route: readonly string[], standing: RunRow["standing"]) {
  const marks: Record<string, StepMark> = {};
  route.forEach((step, index) => {
    marks[step] = index === route.length - 1 ? LAST_MARK[standing] : "done";
  });
  return marks;
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
    route: run.summary.statesVisited,
    marks: marksOf(run.summary.statesVisited, standing),
    active:
      LAST_MARK[standing] === "running" || LAST_MARK[standing] === "waiting" ? stateId : undefined,
  };
}
