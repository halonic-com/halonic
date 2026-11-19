import type { SourcedRun } from "../api.ts";
import type { RunsList } from "../runs-list.ts";
import type { RunPageContext } from "./run-page-model.ts";

/** What the page's words need: the run's workflow, the child runs' workflows, the currency, the time. */
export function pageContext(
  list: RunsList,
  runs: readonly SourcedRun[],
  run: SourcedRun,
  now: Date,
): RunPageContext {
  const { source } = list;
  return {
    workflow: source.workflow(run.summary.hubId, run.summary.workflowId),
    workflowOfRun: (runId) => {
      const other = runs.find((candidate) => candidate.summary.id === runId)?.summary;
      if (other === undefined) {
        return undefined;
      }
      return source.workflow(other.hubId, other.workflowId)?.name ?? other.workflowId;
    },
    providerKind: (id: string) => source.providerKind(id),
    ...(source.providerName === undefined
      ? {}
      : { providerName: (id: string) => source.providerName?.(id) }),
    ...(source.agentName === undefined
      ? {}
      : { agentName: (id: string) => source.agentName?.(id) }),
    currency: source.currency(),
    now,
  };
}
