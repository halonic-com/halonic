// The child run a failed run's step failed with, for the lines `runs show`,
// `run` and `runs send` end that run with (HAL-15555).

import type { RunDetail, RunHistory } from "@halonicjs/app";
import { workspaceModelsOf } from "@halonicjs/app/run-failure";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { providerAddress } from "../../doctor-workspace.ts";
import { runViewDefinitions } from "../../run-view.ts";
import { workflowTitle } from "./listed-run.ts";
import type { FailedChildEnding } from "./show-ending.ts";

/**
 * The child run a failed run's step failed with, read with its own
 * workflow and models, so the run's lines can say the child's cause;
 * `undefined` for any other run.
 */
export async function failedChildEnding(
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
