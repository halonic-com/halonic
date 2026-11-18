import { type RunsList, startedBy } from "@halonicjs/studio-feature-runs/api";
import { useCallback, useSyncExternalStore } from "react";
import type { RunFactsOf } from "./run-facts.ts";

/**
 * What the Inbox says about a run, read from the Runs list: its workflow, its hub and what started
 * it, in the Runs list's own words. `undefined` where the workspace has no Runs list; a run the list
 * doesn't hold yet has no facts, and the item shows without them. It changes with the list.
 */
export function useRunFacts(list: RunsList | undefined): RunFactsOf | undefined {
  const subscribe = useCallback(
    (listener: () => void) => list?.subscribe(listener) ?? (() => {}),
    [list],
  );
  const runs = useSyncExternalStore(subscribe, () => list?.state.runs);
  return useCallback(
    (runId) => {
      const run = runs?.find((candidate) => candidate.summary.id === runId);
      if (list === undefined || run === undefined) return undefined;
      const { summary } = run;
      const { source } = list;
      const trigger = summary.trigger;
      const routineKey =
        trigger?.type === "schedule" || trigger?.type === "every" ? trigger.routineId : undefined;
      return {
        hubId: summary.hubId,
        workflow: source.workflow(summary.hubId, summary.workflowId)?.name ?? summary.workflowId,
        startedBy: startedBy(run, routineKey === undefined ? undefined : source.routine(routineKey))
          .spoken,
      };
    },
    [list, runs],
  );
}
