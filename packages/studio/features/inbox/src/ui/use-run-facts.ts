import {
  type RunsList,
  type SampleCandidate,
  type SourcedRun,
  startedBy,
  useSampleRuns,
} from "@halonicjs/studio-feature-runs/api";
import { useCallback, useSyncExternalStore } from "react";
import type { Inbox } from "../inbox.ts";
import type { InboxWaitContext } from "../wait-context.ts";
import type { RunFacts, RunFactsOf } from "./run-facts.ts";

/**
 * What the Inbox says about a run, read from the Runs list: its workflow, its hub, what started
 * it, in the Runs list's own words, and whether a waiting run is on Sample answers. A run the list
 * doesn't hold yet has no facts, and the item shows without them. It changes with the list.
 * Without a Runs list, as in the served Studio, a waiting run's facts are what `inbox`'s host said
 * about it (`studio.served-wait-context`), with no hub or "Started by".
 */
export function useRunFacts(list: RunsList | undefined, inbox?: Inbox): RunFactsOf | undefined {
  const subscribe = useCallback(
    (listener: () => void) => list?.subscribe(listener) ?? (() => {}),
    [list],
  );
  const runs = useSyncExternalStore(subscribe, () => list?.state.runs);
  const samples = useSampleRuns(list?.source, waitingRuns(runs));
  return useCallback(
    (runId) => {
      if (list === undefined) return factsOfContext(inbox?.waitContext(runId));
      const run = runs?.find((candidate) => candidate.summary.id === runId);
      if (run === undefined) return undefined;
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
    [list, runs, samples, inbox],
  );
}

/** A waiting run's facts from what its host said about it; `undefined` when it said nothing. */
function factsOfContext(context: InboxWaitContext | undefined): RunFacts | undefined {
  if (context === undefined) return undefined;
  const { workflow, description, startInput, sample } = context;
  return {
    workflow,
    sample,
    ...(startInput === undefined ? {} : { startInput }),
    // The host describes only the step the run waits at, which is the step its item is for.
    stepDescription: () => description,
  };
}

/** The real runs that wait, the only ones the Inbox has items for. */
function waitingRuns(runs: readonly SourcedRun[] | undefined): SampleCandidate[] {
  return (runs ?? [])
    .filter(({ summary }) => summary.status === "waiting" && summary.kind !== "test")
    .map(({ summary }) => ({ id: summary.id, standing: summary.status }));
}
