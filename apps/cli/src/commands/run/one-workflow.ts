// The workflow `halonic run` runs, as typed. Run with none, it says which
// workflows the workspace has under the usage line, as a wrong name does
// (HAL-19285), so a first run doesn't end at the usage alone.

import { hubWorkflows } from "@halonicjs/app";
import { type CommandContext, type CommandInput, UsageError } from "../../command.ts";
import type { Message } from "../../messages/define.ts";
import { runMessages } from "../../messages/run.ts";
import { workflowMessages } from "../../messages/workflow.ts";
import { printable } from "../../output/printable.ts";
import { loadRunWorkspace } from "../../run-workspace.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { workspaceNameOf } from "../../workspace-trust.ts";
import type { RunSetup } from "./run.ts";

/**
 * The one argument, the workflow as typed; else the usage error with the
 * usage line. With no workflow at all, the line under the usage lists the
 * workspace's workflows: "Workflows in Acme: weekly-report, support-reply.",
 * or how to add one when it has none.
 *
 * @throws UsageError when there isn't exactly one workflow
 */
export async function oneWorkflow(
  input: CommandInput,
  context: CommandContext,
  setup: Pick<RunSetup, "history" | "profile">,
): Promise<string> {
  const [workflow, ...more] = input.positionals;
  if (workflow !== undefined && more.length === 0) {
    return workflow;
  }
  const problem = runMessages.takesOneWorkflow(input.positionals);
  const workflows = workflow === undefined ? await workflowsHere(input, context, setup) : undefined;
  throw new UsageError(problem, undefined, workflows);
}

/**
 * "Workflows in Acme: weekly-report, support-reply." for the workspace the
 * run would start, the live version as `run` reads it. Nothing when there's
 * no workspace or it can't be read: the usage line is enough then, and the
 * reason would hide the usage error the person made.
 */
async function workflowsHere(
  input: CommandInput,
  context: CommandContext,
  setup: Pick<RunSetup, "history" | "profile">,
): Promise<Message | undefined> {
  try {
    const dir = await openWorkspaceDir(input, context);
    const run = await loadRunWorkspace(dir, setup.history, undefined, setup.profile);
    if (run.found !== "loaded") {
      return undefined;
    }
    const ids = hubWorkflows(run.workspace).map((each) => each.workflow.id);
    return workflowMessages.seeWorkflows(printable(workspaceNameOf(run.workspace, dir)), ids);
  } catch {
    return undefined;
  }
}
