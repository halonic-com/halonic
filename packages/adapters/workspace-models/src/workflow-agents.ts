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
  const names: Named[] = [];
  for (const state of Object.values(workflow.states)) {
    if (state.agent !== undefined) names.push({ kind: "agent", id: state.agent });
    if (state.workflow !== undefined) names.push({ kind: "workflow", id: state.workflow });
    for (const branch of Object.values(state.branches ?? {})) {
      names.push({ kind: "agent", id: branch.agent });
    }
  }
  return names;
}
