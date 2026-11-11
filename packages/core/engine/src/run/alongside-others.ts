// Whether a run's model call runs alongside other calls: then it is offered
// only the connector tools that read (HAL-5214). A run records one effect at
// a time, and a call that waits for a person would only end a `parallel`
// branch or fail a `foreach` state's run.

import type { RunStore } from "@halonicjs/ports";
import { branchOfCall } from "../kernel/run-branches.ts";
import { itemCallOf } from "../kernel/run-items.ts";
import type { RunState } from "../kernel/run-state.ts";
import { readRun } from "../kernel/step.ts";
import { maxChildDepth } from "../states/workflow/state.ts";

/**
 * Whether the call runs alongside others: it is a `parallel` branch's or a
 * `foreach` item's, or its run is the child run of a `foreach` item that
 * runs a workflow, or a run below one.
 *
 * @param runs - where the run's parents are read; without it, only the run itself counts
 */
export async function callAlongsideOthers(
  runs: Pick<RunStore, "events" | "snapshot"> | undefined,
  run: RunState,
  callId: string,
): Promise<boolean> {
  if (branchOfCall(run.parallel, callId) !== null) return true;
  if (itemCallOf(run.foreach, callId) !== null) return true;
  return runs !== undefined && (await underForeachItem(runs, run));
}

/** Whether a run is a `foreach` item's child run, or a run below one. */
async function underForeachItem(
  runs: Pick<RunStore, "events" | "snapshot">,
  run: RunState,
): Promise<boolean> {
  let child = run;
  for (let depth = 0; depth < maxChildDepth && child.parent !== null; depth += 1) {
    const parent = await readRun(runs, child.parent.runId);
    if (parent === null) return false;
    const childRunId = child.runId;
    const items = parent.foreach?.running ?? [];
    if (items.some((item) => "childRunId" in item && item.childRunId === childRunId)) return true;
    child = parent;
  }
  return false;
}
