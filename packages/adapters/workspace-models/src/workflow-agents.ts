// The agents a workflow runs, found in the workspace's files (HAL-10236): the
// CLI's sandbox gate and `halonic run` read them to refuse a workflow before
// it starts, and the Studio's engine reads them to refuse one it can't run.

import type { Workflow } from "@halonicjs/format";
import { filesOf, type LoadedFileOf, type LoadedWorkspace } from "@halonicjs/workspace";

/** The hub's workflow a run starts. */
export interface WorkflowRef {
  readonly hubId: string;
  readonly workflowId: string;
}

/** An agent or a workflow a workflow's states name. */
type Named = { readonly kind: "agent" | "workflow"; readonly id: string };

/**
 * The agents of the hub's workflow, and of every workflow it starts, each
 * once, in the order the workflow first names them. An agent with no file in
 * the hub is left out.
 *
 * @example
 * workflowAgentsOf(workspace, { hubId: "support", workflowId: "support-reply" }); // [agent file of "writer"]
 */
export function workflowAgentsOf(
  workspace: LoadedWorkspace,
  { hubId, workflowId }: WorkflowRef,
): LoadedFileOf<"agent">[] {
  const workflows = firstById(filesOf(workspace, "workflow"), hubId);
  const agents = firstById(filesOf(workspace, "agent"), hubId);
  const found = new Map<string, LoadedFileOf<"agent">>();
  const seen = new Set<string>();
  const visit = (id: string): void => {
    const workflow = workflows.get(id)?.value;
    if (workflow === undefined || seen.has(id)) return;
    seen.add(id);
    for (const name of namedIn(workflow)) {
      if (name.kind === "workflow") {
        visit(name.id);
        continue;
      }
      const agent = agents.get(name.id);
      if (agent !== undefined) found.set(name.id, agent);
    }
  };
  visit(workflowId);
  return [...found.values()];
}

/**
 * The agents each state of the hub's workflow runs, by state id: its own agent, its branches', and
 * every agent of a workflow it starts, each once, in the order the state names them. A state that
 * runs no agent with a file in the hub is left out, as is every state of a workflow that isn't there.
 *
 * @example
 * stateAgentsOf(workspace, { hubId: "support", workflowId: "reply" }).get("draft"); // [agent file of "writer"]
 */
export function stateAgentsOf(
  workspace: LoadedWorkspace,
  { hubId, workflowId }: WorkflowRef,
): Map<string, LoadedFileOf<"agent">[]> {
  const workflow = firstById(filesOf(workspace, "workflow"), hubId).get(workflowId)?.value;
  const agents = firstById(filesOf(workspace, "agent"), hubId);
  const byState = new Map<string, LoadedFileOf<"agent">[]>();
  for (const [stateId, state] of Object.entries(workflow?.states ?? {})) {
    const found = agentsOfState(state, (name) =>
      name.kind === "workflow"
        ? workflowAgentsOf(workspace, { hubId, workflowId: name.id })
        : [agents.get(name.id)].filter((file) => file !== undefined),
    );
    if (found.length > 0) byState.set(stateId, found);
  }
  return byState;
}

/** The agents one state runs, each once, given the files each name it has stands for. */
function agentsOfState(
  state: Workflow["states"][string],
  agentFilesOf: (name: Named) => LoadedFileOf<"agent">[],
): LoadedFileOf<"agent">[] {
  const found = new Map<string, LoadedFileOf<"agent">>();
  for (const file of namedInState(state).flatMap(agentFilesOf)) {
    if (!found.has(file.value.id)) found.set(file.value.id, file);
  }
  return [...found.values()];
}

/** Whether the harness an agent runs in starts a program on this computer: any but `halonic`. */
export function startsAProgram(harness: string | undefined): boolean {
  return harness !== undefined && harness !== "halonic";
}

/**
 * The hub's files of one kind by id. A duplicate id is an error the loader
 * reports; the first by path wins, as in `definitionsOf`.
 */
function firstById<File extends LoadedFileOf<"workflow" | "agent">>(
  files: readonly File[],
  hubId: string,
): Map<string, File> {
  const byId = new Map<string, File>();
  for (const file of files) {
    if (file.hub === hubId && !byId.has(file.value.id)) byId.set(file.value.id, file);
  }
  return byId;
}

/** Every agent and workflow the states of a workflow name, in the order they appear. */
function namedIn(workflow: Workflow): Named[] {
  return Object.values(workflow.states).flatMap(namedInState);
}

/** The agent and workflow one state names, then its branches' agents. */
function namedInState(state: Workflow["states"][string]): Named[] {
  const names: Named[] = [];
  if (state.agent !== undefined) names.push({ kind: "agent", id: state.agent });
  if (state.workflow !== undefined) names.push({ kind: "workflow", id: state.workflow });
  for (const branch of Object.values(state.branches ?? {})) {
    names.push({ kind: "agent", id: branch.agent });
  }
  return names;
}
