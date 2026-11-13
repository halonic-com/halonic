import type { RunSummary } from "@halonicjs/events";
import type { RunsList } from "../runs-list.ts";
import { type RunRow, runRow } from "./run-row.ts";

/** The routine that started the run, when its trigger names one. */
function routineOf(list: RunsList, summary: RunSummary) {
  const key = summary.trigger?.routineId;
  return key === undefined ? undefined : list.source.routine(key);
}

/** The rows of every run the list holds, in its order: the Runs page and Home's Recent runs draw these. */
export function listRows(list: RunsList, now: Date): RunRow[] {
  const currency = list.source.currency();
  return list.state.runs.map((run) =>
    runRow(run, {
      workflow: list.source.workflow(run.summary.hubId, run.summary.workflowId),
      routine: routineOf(list, run.summary),
      currency,
      now,
    }),
  );
}
