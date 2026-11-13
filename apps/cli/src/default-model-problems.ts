// What `halonic validate` adds to the loader's issues: a hub whose agents
// would call a model alias no file has (HAL-7938). `loadWorkspace` checks the
// model an agent names, but not the one it gets when it names none, so a new
// workspace without `models.yaml` passed and then failed on its first run.

import {
  callModelName,
  definitionsOf,
  filesOf,
  type LoadedWorkspace,
  resolveModel,
  type WorkspaceIssue,
} from "@halonicjs/workspace";

/**
 * One warning per hub with an agent that names no model, when the model such
 * an agent gets (the hub's default, else the workspace's, else `default`) is
 * an alias the hub doesn't have. It sits on the first such agent's file.
 * A default with a `/` names a provider and a model directly, and a provider
 * no file has is `loadWorkspace`'s to report.
 *
 * @example
 * defaultModelProblems(await loadWorkspace(store));
 * // [{ file: "hubs/notes/agents/clerk.agent.yaml", severity: "warning", code: "unknown-default-model", … }]
 */
export function defaultModelProblems(workspace: LoadedWorkspace): WorkspaceIssue[] {
  const problems: WorkspaceIssue[] = [];
  const seen = new Set<string>();
  for (const agent of filesOf(workspace, "agent")) {
    const hub = agent.hub;
    if (hub === null || agent.value.model !== undefined || seen.has(hub)) {
      continue;
    }
    seen.add(hub);
    const name = callModelName(definitionsOf(workspace, hub), {});
    if (name.includes("/") || resolveModel(workspace, hub, name) !== undefined) {
      continue;
    }
    problems.push({
      file: agent.path,
      severity: "warning",
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
