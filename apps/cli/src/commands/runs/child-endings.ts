// The child runs whose lines end the run that started them, for `runs show`,
// `run` and `runs send`: the child a failed run's step failed with
// (HAL-15555), and the child a waiting run waits on (HAL-15951).

import { providerAddress } from "@halonicjs/adapter-doctor-node";
import type { RunDetail, RunHistory } from "@halonicjs/app";
import { workspaceModelsOf } from "@halonicjs/app/run-failure";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { runViewDefinitions } from "../../run-view.ts";
import { workflowTitle } from "./listed-run.ts";
import type { ChildEndings, FailedChildEnding, WaitingChildEnding } from "./show-ending.ts";

/**
 * The child runs a run's ending says something about, each read with its
 * own workflow; none for a run that neither failed with a child nor waits
 * on one.
 */
export async function childEndings(
  history: RunHistory,
  run: RunDetail,
  loaded: LoadedWorkspace,
): Promise<ChildEndings> {
  const failed = await failedChildEnding(history, run, loaded);
  const waiting = await waitingChildEnding(history, run, loaded);
  return {
    ...(failed === undefined ? {} : { failed }),
    ...(waiting === undefined ? {} : { waiting }),
  };
}

/**
 * The child run a failed run's step failed with, read with its own
 * workflow and models, so the run's lines can say the child's cause;
 * `undefined` for any other run.
 */
async function failedChildEnding(
  history: RunHistory,
  run: RunDetail,
  loaded: LoadedWorkspace,
): Promise<FailedChildEnding | undefined> {
  if (run.summary.status !== "failed") {
    return undefined;
  }
  const child = await history.failedChild(run);
  if (child === undefined) {
    return undefined;
  }
  const { summary } = child.run;
  const definitions = runViewDefinitions(loaded, summary);
  return {
    item: child.item,
    run: child.run,
    title: workflowTitle(definitions.workflow, summary),
    definitions,
    models: () => workspaceModelsOf(loaded, summary.hubId, providerAddress),
  };
}

/**
 * The run a waiting run's answer goes to when it waits on a child run,
 * read with its own workflow, so the run's lines can say what that child
 * waits for and how to answer it; `undefined` for any other run.
 */
async function waitingChildEnding(
  history: RunHistory,
  run: RunDetail,
  loaded: LoadedWorkspace,
): Promise<WaitingChildEnding | undefined> {
  const child = await history.waitingChild(run);
  if (child === undefined) {
    return undefined;
  }
  return { summary: child.summary, definitions: runViewDefinitions(loaded, child.summary) };
}
