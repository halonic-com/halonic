// What `halonic validate` adds to the loader's issues: a hub whose agents
// would call a model alias no file has (HAL-7938). `loadWorkspace` checks the
// model an agent names, but not the one it gets when it names none, so a new
// workspace without `models.yaml` passed and then failed on its first run.
// When a workflow runs such an agent, the run fails on it, so it is an error
// (HAL-14260); when none does, nothing fails yet, and it stays a warning.
// An agent whose harness starts a program, such as Claude Code, asks that
// program for no model when it names none, so it never uses the default.

import { startsAProgram, workflowAgentsOf } from "@halonicjs/adapter-workspace-models";
import {
  callModelName,
  definitionsOf,
  filesOf,
  type LoadedFileOf,
  type LoadedWorkspace,
  placeOf,
  resolveModel,
  type WorkspaceIssue,
} from "@halonicjs/workspace";

/**
 * One problem per hub with an agent that names no model, when the model such
 * an agent gets (the hub's default, else the workspace's, else `default`) is
 * an alias the hub doesn't have. A default with a `/` names a provider and a
 * model directly, and a provider no file has is `loadWorkspace`'s to report.
 * Nor is it reported when a file the aliases come from failed: the alias may
 * be in it, and its own errors say what to fix (HAL-14261).
 *
 * - **Error**, on the first such agent a workflow of the hub runs: a run of
 *   that workflow would stop when the agent calls the model.
 * - **Warning**, on the first such agent's file, when no workflow runs one.
 *
 * @example
 * defaultModelProblems(await loadWorkspace(store));
 * // [{ file: "hubs/notes/agents/clerk.agent.yaml", severity: "error", code: "unknown-default-model", … }]
 */
export function defaultModelProblems(workspace: LoadedWorkspace): WorkspaceIssue[] {
  const problems: WorkspaceIssue[] = [];
  for (const [hub, agents] of agentsOnDefaultModel(workspace)) {
    if (aliasFileFailed(workspace, hub)) continue;
    const name = callModelName(definitionsOf(workspace, hub), {});
    if (name.includes("/") || resolveModel(workspace, hub, name) !== undefined) {
      continue;
    }
    const runIds = new Set(agentsRunByWorkflows(workspace, hub).map((agent) => agent.value.id));
    const agent = agents.find((each) => runIds.has(each.value.id)) ?? agents[0];
    if (agent === undefined) continue;
    problems.push({
      file: agent.path,
      severity: runIds.has(agent.value.id) ? "error" : "warning",
      source: "check",
      code: "unknown-default-model",
      path: [],
      line: 1,
      col: 1,
      message: `Hub "${hub}" has no model alias "${name}", which agent "${agent.value.id}" and the other agents without a model use: add the alias to models.yaml, or set defaults.model`,
    });
  }
  return problems;
}

/**
 * Each hub's agents that would call the default model, in path order, for
 * hubs that have any: those that name no model and run in Halonic itself.
 */
function agentsOnDefaultModel(workspace: LoadedWorkspace): Map<string, LoadedFileOf<"agent">[]> {
  const byHub = new Map<string, LoadedFileOf<"agent">[]>();
  for (const agent of filesOf(workspace, "agent")) {
    if (agent.hub === null || agent.value.model !== undefined) continue;
    if (startsAProgram(agent.value.harness)) continue;
    byHub.set(agent.hub, [...(byHub.get(agent.hub) ?? []), agent]);
  }
  return byHub;
}

/** Every agent a workflow of the hub runs, as `halonic run` finds them. */
function agentsRunByWorkflows(workspace: LoadedWorkspace, hub: string): LoadedFileOf<"agent">[] {
  return filesOf(workspace, "workflow")
    .filter((workflow) => workflow.hub === hub)
    .flatMap((workflow) =>
      workflowAgentsOf(workspace, { hubId: hub, workflowId: workflow.value.id }),
    );
}

/** Whether `models.yaml` or the hub's `hub.yaml` was read but failed its own checks. */
function aliasFileFailed(workspace: LoadedWorkspace, hub: string): boolean {
  const parsed = new Set(workspace.files.map((file) => file.path));
  return workspace.issues.some((issue) => {
    if (issue.severity !== "error" || parsed.has(issue.file)) {
      return false;
    }
    const place = placeOf(issue.file);
    return place?.kind === "models" || (place?.kind === "hub" && place.hub === hub);
  });
}
