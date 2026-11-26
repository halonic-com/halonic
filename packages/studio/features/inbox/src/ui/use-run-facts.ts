import {
  type RunsList,
  type SampleCandidate,
  type SourcedRun,
  startedBy,
  useSampleRuns,
} from "@halonicjs/studio-feature-runs/api";
import { useCallback, useSyncExternalStore } from "react";
import type { RunFactsOf } from "./run-facts.ts";

/**
 * What the Inbox says about a run, read from the Runs list: its workflow, its hub, what started
 * it, in the Runs list's own words, and whether a waiting run is on Sample answers. `undefined`
 * where the workspace has no Runs list; a run the list doesn't hold yet has no facts, and the item
 * shows without them. It changes with the list.
 */
export function useRunFacts(list: RunsList | undefined): RunFactsOf | undefined {
  const subscribe = useCallback(
    (listener: () => void) => list?.subscribe(listener) ?? (() => {}),
    [list],
  );
  const runs = useSyncExternalStore(subscribe, () => list?.state.runs);
  const samples = useSampleRuns(list?.source, waitingRuns(runs));
  return useCallback(
    (runId) => {
      const run = runs?.find((candidate) => candidate.summary.id === runId);
      if (list === undefined || run === undefined) return undefined;
      const { summary } = run;
      const { source } = list;
      const workflow = source.workflow(summary.hubId, summary.workflowId);
      // A schedule's run and a routine's Run now both name their routine.
      const routineKey = summary.trigger?.routineId;
      return {
        hubId: summary.hubId,
        workflow: workflow?.name ?? summary.workflowId,
        startedBy: startedBy(run, routineKey === undefined ? undefined : source.routine(routineKey))
          .spoken,
        sample: samples.has(runId),
        startField: workflow?.startField,
        stepDescription: workflow?.stepDescription,
      };
    },
    [list, runs, samples],
  );
}

/** The real runs that wait, the only ones the Inbox has items for. */
function waitingRuns(runs: readonly SourcedRun[] | undefined): SampleCandidate[] {
  return (runs ?? [])
    .filter(({ summary }) => summary.status === "waiting" && summary.kind !== "test")
    .map(({ summary }) => ({ id: summary.id, standing: summary.status }));
}
