import type { Branch, WorkflowState } from "@halonicjs/format";
import { validateWorkflow } from "@halonicjs/workflow";
import type { LoadedFileOf, WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";
import { findLoops } from "./loops.ts";

type Workflow = LoadedFileOf<"workflow">;
type Agent = LoadedFileOf<"agent">["value"];

/** The keys and list indexes to a value in a workflow file. */
type Path = WorkspaceIssue["path"];

/**
 * What a workflow names in other files: the workflow package's static
 * checks with the agents and workflows of its hub, and the methods it calls
 * with their arguments. The messages are the old loader's. A workflow in a
 * hub whose `hub.yaml` failed isn't checked: the old loader left that hub
 * out.
 */
export function checkWorkflows(context: CheckContext): WorkspaceIssue[] {
  const issues: WorkspaceIssue[] = [];
  for (const workflow of context.filesOf("workflow")) {
    if (context.hubFailed(workflow.hub)) {
      continue;
    }
    issues.push(...staticIssues(context, workflow));
    issues.push(...methodIssues(context, workflow));
  }
  return issues;
}

/** The workflow package's checks: unknown states, agents and workflows, dead ends and more. */
function staticIssues(context: CheckContext, workflow: Workflow): WorkspaceIssue[] {
  const options = {
    agents: [...context.idsOf("agent", workflow.hub)],
    workflows: [...context.idsOf("workflow", workflow.hub)],
  };
  return validateWorkflow(workflow.value, options).map((found) =>
    context.issue(found.severity, workflow.path, found.path, found.code, found.message),
  );
}

/** One call of an agent's method: a state's own, or one branch of a parallel state. */
interface MethodCall {
  readonly agent: string;
  readonly method: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  /** The key path of the state or branch that makes the call. */
  readonly at: Path;
}

/**
 * Each method call names a method its agent has, and gives every argument
 * the method takes in `with`; an argument it doesn't take is a warning. A
 * call to an agent the hub doesn't have is left to the static checks, which
 * report the agent.
 */
function methodIssues(context: CheckContext, workflow: Workflow): WorkspaceIssue[] {
  const agents = new Map(
    context.filesOf("agent", workflow.hub).map((agent) => [agent.value.id, agent.value]),
  );
  const issues: WorkspaceIssue[] = [];
  for (const call of methodCalls(workflow)) {
    const agent = agents.get(call.agent);
    if (agent === undefined) {
      continue;
    }
    issues.push(...callIssues(context, workflow, agent, call));
  }
  return issues;
}

function callIssues(
  context: CheckContext,
  workflow: Workflow,
  agent: Agent,
  call: MethodCall,
): WorkspaceIssue[] {
  const method = agent.methods[call.method];
  if (method === undefined) {
    const message = `Agent "${agent.id}" has no method "${call.method}"`;
    return [context.error(workflow.path, [...call.at, "method"], "unknown-method", message)];
  }
  const missing = method.input
    .filter((name) => !(name in call.arguments))
    .map((name) => {
      const message = `Method "${call.method}" needs "${name}" in with`;
      return context.error(workflow.path, [...call.at, "with"], "missing-argument", message);
    });
  const extra = Object.keys(call.arguments)
    .filter((name) => !method.input.includes(name))
    .map((name) => {
      const message = `Method "${call.method}" does not take "${name}"`;
      const path = [...call.at, "with", name];
      return context.issue("warning", workflow.path, path, "extra-argument", message);
    });
  return [...missing, ...extra];
}

/** Every method call in a workflow, in the order of its states and their branches. */
function methodCalls(workflow: Workflow): MethodCall[] {
  const calls: MethodCall[] = [];
  for (const [id, state] of Object.entries(workflow.value.states)) {
    const call = callOf(state, ["states", id]);
    if (call !== null) {
      calls.push(call);
    }
    for (const [name, branch] of Object.entries(state.branches ?? {})) {
      const branchCall = callOf(branch, ["states", id, "branches", name]);
      if (branchCall !== null) {
        calls.push(branchCall);
      }
    }
  }
  return calls;
}

/** The method call of a state or branch; `null` when it calls no method of an agent. */
function callOf(step: WorkflowState | Branch, at: Path): MethodCall | null {
  if (step.agent === undefined || step.method === undefined) {
    return null;
  }
  return { agent: step.agent, method: step.method, arguments: step.with ?? {}, at };
}

/**
 * Workflows of one hub that run each other in a loop, reported once per
 * loop on its first workflow, at the state that runs the next one. The
 * message is the old loader's.
 */
export function checkSubflowLoops(context: CheckContext): WorkspaceIssue[] {
  const hubs = new Set(context.filesOf("workflow").map((workflow) => workflow.hub));
  const issues: WorkspaceIssue[] = [];
  for (const hub of hubs) {
    if (context.hubFailed(hub)) {
      continue;
    }
    const workflows = new Map(
      context.filesOf("workflow", hub).map((workflow) => [workflow.value.id, workflow]),
    );
    const runs = (id: string): string[] => subflowsOf(workflows.get(id)).map(([, to]) => to);
    for (const loop of findLoops([...workflows.keys()], runs)) {
      const first = workflows.get(loop[0] ?? "");
      const state = subflowsOf(first).find(([, to]) => to === loop[1])?.[0];
      if (first !== undefined && state !== undefined) {
        const message = `Workflows run each other in a loop: ${loop.join(" → ")}`;
        const path = ["states", state, "workflow"];
        issues.push(context.error(first.path, path, "subflow-loop", message));
      }
    }
  }
  return issues;
}

/** The states of a workflow that run another workflow, as `[state, workflow]` pairs. */
function subflowsOf(workflow: Workflow | undefined): [string, string][] {
  const pairs: [string, string][] = [];
  for (const [id, state] of Object.entries(workflow?.value.states ?? {})) {
    if (state.workflow !== undefined) {
      pairs.push([id, state.workflow]);
    }
  }
  return pairs;
}
