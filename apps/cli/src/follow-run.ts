// What Ctrl C means while a command follows a run (cli-output 1.5), used by
// `halonic run`, and by `halonic runs send` once it moves here (HAL-4025):
// the run stops being followed, and the command says after which step it was
// cancelled, or that it couldn't be cancelled (HAL-4356).

import { RunFollowStopped, runSteps, shortRunId } from "@halonicjs/app";
import { type RunEvent, summarize } from "@halonicjs/events";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { StoppedResult } from "./command.ts";
import { runMessages } from "./messages/run.ts";
import { stepName } from "./messages/step-name.ts";
import { runViewDefinitions } from "./run-view.ts";
import type { WorkspaceEngine } from "./workspace-engine.ts";

/**
 * Follows a run with the engine's signal. Ctrl C or SIGTERM gives the
 * {@link stoppedResult} of what was followed so far; a step that keeps
 * failing throws its last error.
 *
 * @param follow - starts or follows the run with `signal`, such as `WorkflowRuns.follow`
 * @param dir - the user's own `--dir`, repeated in the command a run that
 *   wasn't cancelled suggests
 * @throws the stuck step's last error, when a run's step keeps failing
 * @throws AbortError on Ctrl C before the run started: `runCli` prints "Stopped."
 *
 * @example
 * const run = await followUntilStopped(engine, workspace, (signal) =>
 *   workflowRuns.follow(runId, { after, signal }),
 * );
 * if ("stopped" in run) return run;
 */
export async function followUntilStopped<T>(
  engine: Pick<WorkspaceEngine, "signal" | "stuck">,
  workspace: LoadedWorkspace,
  follow: (signal: AbortSignal) => Promise<T>,
  dir?: string,
): Promise<T | StoppedResult> {
  try {
    return await follow(engine.signal);
  } catch (error) {
    if (engine.stuck.aborted) {
      throw engine.stuck.reason;
    }
    if (error instanceof RunFollowStopped) {
      return stoppedResult(error, workspace, dir);
    }
    throw error;
  }
}

/**
 * What stopping with Ctrl C meant for the run (cli-output 1.5): "The run
 * 01jd8q was cancelled after the step Classify it. Nothing after it ran."
 * A run stopped before it finished a step, or before it started, says only
 * "Stopped.". A run the engine couldn't cancel goes on in the store, so it
 * says so and how to see it, whatever step it was at (HAL-4356).
 *
 * @param dir - the user's own `--dir`, repeated in the suggested command
 */
export function stoppedResult(
  stopped: Pick<RunFollowStopped, "runId" | "events" | "cancelled">,
  workspace: LoadedWorkspace,
  dir?: string,
): StoppedResult {
  const { events } = stopped;
  const summary = summarize(events);
  const json = summary === null ? {} : { run: summary, events };
  if (!stopped.cancelled) {
    return {
      stopped: true,
      meaning: runMessages.notCancelled(shortRunId(stopped.runId), dir).phrase,
      json,
    };
  }
  if (summary === null) {
    return { stopped: true, json };
  }
  const definitions = runViewDefinitions(workspace, summary);
  const lastDone = runSteps(events, summary).findLast((step) => step.end.kind === "done");
  if (lastDone === undefined) {
    return { stopped: true, json };
  }
  const step = stepName(
    lastDone.stateId,
    definitions.workflow?.states[lastDone.stateId]?.description,
  );
  return {
    stopped: true,
    meaning: runMessages.cancelledAfter(shortRunId(summary.id), step).phrase,
    json,
  };
}
