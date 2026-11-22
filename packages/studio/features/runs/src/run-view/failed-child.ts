import { failedChildOf } from "@halonicjs/app";
import { type RunEvent, summarize } from "@halonicjs/events";
import type { SourcedRun } from "../api.ts";
import type { RunsList, RunsListState } from "../runs-list.ts";
import type { FailedChildView } from "./child-failure-banner.ts";
import { useRunLog } from "./every-step.tsx";
import { pageContext } from "./page-context.ts";

/** Stands in for the source while the run has no failed child, so no log is read. */
const noLog = { log: async (): Promise<RunEvent[]> => [] };

/**
 * The child run a failed run's step failed with, and its log, so the run page's banner can say the
 * child's cause (`runs.run-view.failed-child-run`). Which child is `failedChildOf`'s, the reading
 * `RunHistory.failedChild` gives `halonic runs show`, so both name the same one. `undefined` while
 * the run hasn't failed, failed with no child, or the child's log isn't read yet or is empty.
 */
export function useFailedChild(
  list: RunsList,
  run: SourcedRun | undefined,
  log: readonly RunEvent[] | undefined,
  state: RunsListState,
  now: () => Date,
): FailedChildView | undefined {
  const child =
    run?.summary.status === "failed" && log !== undefined ? failedChildOf(log) : undefined;
  const listed = state.runs.find((candidate) => candidate.summary.id === child?.runId);
  const childLog = useRunLog(
    child === undefined ? noLog : list.source,
    child?.runId ?? "",
    listed?.summary.lastSeq ?? 0,
    state,
  );
  if (child === undefined || childLog.events === undefined) {
    return undefined;
  }
  // The log's own summary, as `RunHistory.failedChild` reads it: a log that is gone gives none.
  const summary = summarize(childLog.events);
  if (summary === null) {
    return undefined;
  }
  return {
    item: child.item,
    summary,
    log: childLog.events,
    context: pageContext(list, state.runs, { summary }, now()),
  };
}
