// The workflows a workspace can run, and the one a person named, for
// `halonic runs --workflow`, `halonic run <workflow>` and the Studio. A run
// always runs in a hub (`definitionsOf`), so only hub workflows count; a
// person names one by its id, or as `hub/id` when two hubs have that id
// (C174 on HAL-2000).

import type { KindValues } from "@halonicjs/format";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";

/** A workflow as the workspace defines it. */
export type WorkflowDefinition = KindValues["workflow"];

/** One workflow and the hub it runs in. */
export interface HubWorkflow {
  readonly hubId: string;
  readonly workflow: WorkflowDefinition;
}

/** What a workflow name someone typed points to: one workflow, none, or the same id in several hubs. */
export type WorkflowLookup =
  | { readonly found: "one"; readonly hubId: string; readonly workflow: WorkflowDefinition }
  | { readonly found: "none" }
  /** `hubIds` in the workspace's order; the caller asks for `hub/id`. */
  | { readonly found: "several"; readonly workflowId: string; readonly hubIds: readonly string[] };

/**
 * Every workflow in the workspace's hubs, in the order of their files. A
 * duplicate id in one hub is an error `loadWorkspace` reports; the first by
 * path wins here, as in `definitionsOf`.
 */
export function hubWorkflows(workspace: LoadedWorkspace): HubWorkflow[] {
  const workflows: HubWorkflow[] = [];
  for (const file of filesOf(workspace, "workflow")) {
    const hubId = file.hub;
    if (hubId === null || workflowIn(workflows, hubId, file.value.id) !== undefined) {
      continue;
    }
    workflows.push({ hubId, workflow: file.value });
  }
  return workflows;
}

/**
 * The workflow with this id in this hub, as a run names it; `undefined`
 * when it's no longer in the workspace.
 */
export function workflowIn(
  workflows: readonly HubWorkflow[],
  hubId: string,
  workflowId: string,
): WorkflowDefinition | undefined {
  return workflows.find((each) => each.hubId === hubId && each.workflow.id === workflowId)
    ?.workflow;
}

/**
 * The workflow someone named: `support-reply`, or `support/reply` when two
 * hubs have a workflow `reply` (requirement `app.workflow-lookup`).
 *
 * @example
 * lookUpWorkflow(hubWorkflows(workspace), "reply");
 * // { found: "several", workflowId: "reply", hubIds: ["sales", "support"] }
 */
export function lookUpWorkflow(workflows: readonly HubWorkflow[], typed: string): WorkflowLookup {
  const slash = typed.indexOf("/");
  if (slash !== -1) {
    const hubId = typed.slice(0, slash);
    const workflow = workflowIn(workflows, hubId, typed.slice(slash + 1));
    return workflow === undefined ? { found: "none" } : { found: "one", hubId, workflow };
  }
  const matches = workflows.filter((each) => each.workflow.id === typed);
  const [first] = matches;
  if (first === undefined) {
    return { found: "none" };
  }
  if (matches.length > 1) {
    return { found: "several", workflowId: typed, hubIds: matches.map((each) => each.hubId) };
  }
  return { found: "one", hubId: first.hubId, workflow: first.workflow };
}
