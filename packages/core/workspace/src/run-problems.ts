// Which errors in a workspace's files stop a run of one workflow (Liam,
// HAL-15127). The loader leaves a file with an error out, so a run that
// loads it isn't what the user wrote (HAL-6613). A run of workflow W loads
// its own file, the agents and workflows its steps name, and every file that
// isn't a workflow, agent or test, so an error in any of those stops it. A
// broken draft workflow or an agent W doesn't use stops only its own runs.
// The CLI's refusal and Studio's Run both ask this one function, so they
// can't drift apart again.

import type { Workflow } from "@halonicjs/format";
import {
  filesOf,
  type LoadedFileOf,
  type LoadedWorkspace,
  type WorkspaceIssue,
} from "./load-workspace.ts";
import { placeOf } from "./places.ts";

/** One hub's workflow, as a run starts it. */
export interface WorkflowRef {
  readonly hubId: string;
  readonly workflowId: string;
}

/** The ids a workflow's steps name, and those of every workflow it calls, each once. */
export interface WorkflowUses {
  /** The workflow itself, then each workflow its steps call, in the order they are first named. */
  readonly workflows: readonly string[];
  /** The agents those workflows' steps name, in the order they are first named. */
  readonly agents: readonly string[];
}

/**
 * The code of the problem that a hub's agents without a model would call a
 * default model alias the hub doesn't have. The check that reports it is in
 * `@halonicjs/adapter-workspace-models`; it is named here so that
 * {@link errorsStoppingRun} can tell which runs it stops.
 */
export const unknownDefaultModelCode = "unknown-default-model";

/** Whether the harness an agent runs in starts a program on this computer: any but `halonic`. */
export function startsAProgram(harness: string | undefined): boolean {
  return harness !== undefined && harness !== "halonic";
}

/**
 * Whether an agent calls the hub's default model: it names no model and runs
 * in Halonic itself. A program such as Claude Code is asked for no model then.
 */
export function usesDefaultModel(agent: LoadedFileOf<"agent">): boolean {
  return agent.value.model === undefined && !startsAProgram(agent.value.harness);
}

/** An agent or a workflow one step names. */
export interface StepName {
  readonly kind: "agent" | "workflow";
  readonly id: string;
}

/** The agent and the workflow one step names, then its parallel branches' agents. */
export function namedInStep(state: Workflow["states"][string]): StepName[] {
  const names: StepName[] = [];
  if (state.agent !== undefined) names.push({ kind: "agent", id: state.agent });
  if (state.workflow !== undefined) names.push({ kind: "workflow", id: state.workflow });
  for (const branch of Object.values(state.branches ?? {})) {
    names.push({ kind: "agent", id: branch.agent });
  }
  return names;
}

/**
 * What the hub's workflow uses: the workflows and agents its steps name, and
 * those of every workflow it calls, followed all the way down. A name counts
 * even when its file didn't load, so a broken agent or called workflow is
 * still among them; what a workflow that didn't load calls is unknown.
 *
 * @example
 * workflowUses(workspace, { hubId: "support", workflowId: "reply" });
 * // { workflows: ["reply", "triage"], agents: ["writer", "sorter"] }
 */
export function workflowUses(
  workspace: LoadedWorkspace,
  { hubId, workflowId }: WorkflowRef,
): WorkflowUses {
  const workflows = workflowsById(workspace, hubId);
  const seen = new Set<string>();
  const agents = new Set<string>();
  const visit = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const workflow = workflows.get(id)?.value;
    for (const name of Object.values(workflow?.states ?? {}).flatMap(namedInStep)) {
      if (name.kind === "workflow") visit(name.id);
      else agents.add(name.id);
    }
  };
  visit(workflowId);
  return { workflows: [...seen], agents: [...agents] };
}

/**
 * The errors among `issues` that stop a run of the hub's workflow, in their
 * order. Warnings never do. An error stops it when it is in:
 *
 * - the workflow's own file, or the file of an agent or a workflow it uses
 *   ({@link workflowUses});
 * - any other file that isn't a workflow, agent or test file, such as
 *   `workspace.yaml`, a hub file, a provider or `models.yaml`, or no file at
 *   all: every run can depend on those;
 * - for the default model problem, the hub's agents, when an agent the
 *   workflow uses calls the default model.
 *
 * A file's kind, hub and id come from its path, as a broken file often didn't
 * load. Where that can't tell, the error stops the run: a path no kind places,
 * a workflow that didn't load (its uses are unknown), or an agent it uses
 * that didn't load, for the default model problem.
 *
 * @param issues - every problem `halonic validate` lists, the loader's and the checks' after it
 * @example
 * // weekly-report names an unknown agent; support-reply doesn't use it.
 * errorsStoppingRun(workspace, issues, { hubId: "support", workflowId: "support-reply" }); // []
 */
export function errorsStoppingRun(
  workspace: LoadedWorkspace,
  issues: readonly WorkspaceIssue[],
  run: WorkflowRef,
): WorkspaceIssue[] {
  const errors = issues.filter((issue) => issue.severity === "error");
  if (!workflowsById(workspace, run.hubId).has(run.workflowId)) return errors;
  const uses = workflowUses(workspace, run);
  return errors.filter((issue) => stopsRun(workspace, issue, run, uses));
}

/** Whether one error stops the run; see {@link errorsStoppingRun}. */
function stopsRun(
  workspace: LoadedWorkspace,
  issue: WorkspaceIssue,
  { hubId }: WorkflowRef,
  uses: WorkflowUses,
): boolean {
  const place = issue.file === "" ? undefined : placeOf(issue.file);
  if (place === undefined) return true;
  if (place.kind === "workflowTest") return false;
  if (place.kind !== "workflow" && place.kind !== "agent") return true;
  if (place.hub !== hubId) return false;
  if (issue.code === unknownDefaultModelCode) return callsDefaultModel(workspace, hubId, uses);
  const used = place.kind === "workflow" ? uses.workflows : uses.agents;
  return idsAt(workspace, issue.file, place.placeId).some((id) => used.includes(id));
}

/**
 * The ids a workflow or agent file stands for: the one its name gives and,
 * when it loaded, the one it says, in case the two differ.
 */
function idsAt(workspace: LoadedWorkspace, path: string, placeId: string | undefined): string[] {
  const loaded = workspace.files.find((file) => file.path === path)?.value as
    | { id?: unknown }
    | undefined;
  return [placeId, loaded?.id].filter((id): id is string => typeof id === "string");
}

/** Whether an agent the run uses calls the hub's default model, or one of them didn't load. */
function callsDefaultModel(workspace: LoadedWorkspace, hubId: string, uses: WorkflowUses): boolean {
  const agents = new Map<string, LoadedFileOf<"agent">>();
  for (const agent of filesOf(workspace, "agent")) {
    if (agent.hub === hubId && !agents.has(agent.value.id)) agents.set(agent.value.id, agent);
  }
  return uses.agents.some((id) => {
    const agent = agents.get(id);
    return agent === undefined || usesDefaultModel(agent);
  });
}

/** The hub's workflows by id; the first by path wins, as in `definitionsOf`. */
function workflowsById(
  workspace: LoadedWorkspace,
  hubId: string,
): Map<string, LoadedFileOf<"workflow">> {
  const byId = new Map<string, LoadedFileOf<"workflow">>();
  for (const workflow of filesOf(workspace, "workflow")) {
    if (workflow.hub === hubId && !byId.has(workflow.value.id))
      byId.set(workflow.value.id, workflow);
  }
  return byId;
}
