import { hubWorkflows, workflowIn } from "@halonicjs/app";
import {
  failedModelOf,
  failedStartOf,
  type RunFailedEvent,
  runFailureOf,
} from "@halonicjs/app/run-failure";
import type { RunsSource } from "@halonicjs/studio-feature-runs/api";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { LastFailedRun } from "./workspace-check-source.ts";

/**
 * How the run page names a step (cli-output 3.4): the first line of its description, else its id
 * with a capital first letter. The dialog shows it; the report never holds it (4.3).
 */
function stepNameOf(stateId: string, description: string | undefined): string {
  const firstLine = description?.split("\n")[0]?.trim() ?? "";
  return firstLine !== "" ? firstLine : stateId.charAt(0).toUpperCase() + stateId.slice(1);
}

/**
 * The open folder's last run, when it failed, as the Last run line needs it
 * (first-run-progress 4.2): the step it stopped at and how many the workflow has (its states
 * that aren't a final one), the step's and the agent's names for the screen, how long it ran,
 * and what stopped it (`runFailureOf`, as the run page reads it). A test run, a run that
 * finished or was cancelled, or one whose log has no `run.failed`, gives none.
 */
export async function lastFailedRun(
  runs: RunsSource,
  workspace: LoadedWorkspace,
): Promise<LastFailedRun | undefined> {
  const last = (await runs.list()).find(({ summary }) => summary.kind === "run")?.summary;
  if (last === undefined || last.status !== "failed" || last.state === null) return undefined;
  const log = await runs.log(last.id);
  const failed = log.findLast((event): event is RunFailedEvent => event.type === "run.failed");
  if (failed === undefined) return undefined;
  const models = runs.models?.(last.hubId);
  const model = models === undefined ? undefined : failedModelOf(log, models);
  const failure = runFailureOf(failed, model, failedStartOf(log, failed));
  const states = workflowIn(hubWorkflows(workspace), last.hubId, last.workflowId)?.states ?? {};
  const steps = Object.values(states).filter((state) => state.type !== "final").length;
  const agent = model === undefined ? undefined : runs.agentName?.(model.agent);
  return {
    runId: last.id,
    hub: last.hubId,
    step: Math.min(last.statesVisited.length, Math.max(steps, 1)),
    steps: Math.max(steps, 1),
    stepName: stepNameOf(last.state, states[last.state]?.description),
    ...(agent === undefined ? {} : { agentName: agent }),
    durationMs: Date.parse(last.endedAt ?? last.startedAt) - Date.parse(last.startedAt),
    failure,
  };
}
