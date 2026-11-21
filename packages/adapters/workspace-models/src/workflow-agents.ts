// The agents a workflow runs, found in the workspace's files (HAL-10236): the
// CLI's sandbox gate and `halonic run` read them to refuse a workflow before
// it starts, and the Studio's engine reads them to refuse one it can't run.
// What a workflow uses is the workspace's `workflowUses`, which also decides
// which errors stop its run (HAL-15127).

import type { Workflow } from "@halonicjs/format";
import {
  filesOf,
  type LoadedFileOf,
  type LoadedWorkspace,
  namedInStep,
  type StepName,
  type WorkflowRef,
  workflowUses,
} from "@halonicjs/workspace";

export { startsAProgram, type WorkflowRef } from "@halonicjs/workspace";

/**
 * The agents of the hub's workflow, and of every workflow it starts, each
 * once, in the order the workflow first names them. An agent with no file in
 * the hub is left out, and so are their subagents: the sandbox gate reads
 * this, and widening it is a security change of its own.
 *
 * @example
 * workflowAgentsOf(workspace, { hubId: "support", workflowId: "support-reply" }); // [agent file of "writer"]
 */
export function workflowAgentsOf(
  workspace: LoadedWorkspace,
  ref: WorkflowRef,
): LoadedFileOf<"agent">[] {
  const agents = firstById(filesOf(workspace, "agent"), ref.hubId);
  return workflowUses(workspace, ref)
    .agents.map((id) => agents.get(id))
    .filter((agent) => agent !== undefined);
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
  agentFilesOf: (name: StepName) => LoadedFileOf<"agent">[],
): LoadedFileOf<"agent">[] {
  const found = new Map<string, LoadedFileOf<"agent">>();
  for (const file of namedInStep(state).flatMap(agentFilesOf)) {
    if (!found.has(file.value.id)) found.set(file.value.id, file);
  }
  return [...found.values()];
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
