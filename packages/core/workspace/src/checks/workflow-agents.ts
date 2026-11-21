import type { Branch, WorkflowState } from "@halonicjs/format";
import type { LoadedFileOf } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";
import { findLoops } from "./loops.ts";

type Workflow = LoadedFileOf<"workflow">;
type Agent = LoadedFileOf<"agent">["value"];

/** How a workflow's runs call one agent. */
export interface AgentUse {
  /**
   * Every call is a step of its own with the agent's own output: no method,
   * no `format` and never as another agent's subagent. Only then must every
   * answer be one of a `choice` agent's options.
   */
  readonly onlyAsItsOwnOutput: boolean;
}

/**
 * The agents a workflow's runs call, as a test's scripted model sees them:
 * the agents of its steps and parallel branches, those of the workflows it
 * runs, and their subagents. `undefined` when a workflow or agent it reaches
 * didn't parse, since what that file names can't be known, or when the
 * workflows it reaches run each other in a loop: that loop's error is the
 * cause, and such a run never gets to its agents.
 */
export function agentUsesOf(
  context: CheckContext,
  workflow: Workflow,
): Map<string, AgentUse> | undefined {
  const workflows = new Map(
    context.filesOf("workflow", workflow.hub).map((each) => [each.value.id, each.value]),
  );
  const reached = reachedWorkflows(workflow.value.id, workflows);
  if (reached === undefined) {
    return undefined;
  }
  const uses = new AgentUses();
  for (const id of reached) {
    for (const state of Object.values(workflows.get(id)?.states ?? {})) {
      for (const step of stepsOf(state)) {
        uses.add(step.agent, step.ownOutput);
      }
    }
  }
  const agents = new Map(
    context.filesOf("agent", workflow.hub).map((agent) => [agent.value.id, agent.value]),
  );
  return addSubagents(uses, agents) ? uses.byAgent : undefined;
}

/** The uses found so far, one per agent: one call that isn't its own output makes them all count so. */
class AgentUses {
  readonly byAgent = new Map<string, AgentUse>();

  add(agentId: string, ownOutput: boolean): void {
    const before = this.byAgent.get(agentId)?.onlyAsItsOwnOutput ?? true;
    this.byAgent.set(agentId, { onlyAsItsOwnOutput: before && ownOutput });
  }
}

/**
 * Adds the subagents of every agent used, and theirs; `false` when one of
 * those agents didn't parse, so its subagents can't be known.
 */
function addSubagents(uses: AgentUses, agents: ReadonlyMap<string, Agent>): boolean {
  const toExpand = [...uses.byAgent.keys()];
  const expanded = new Set<string>();
  for (let next = toExpand.pop(); next !== undefined; next = toExpand.pop()) {
    const agent = agents.get(next);
    if (agent === undefined) {
      return false;
    }
    expanded.add(next);
    for (const subagent of agent.subagents) {
      uses.add(subagent, false);
      if (!expanded.has(subagent)) {
        toExpand.push(subagent);
      }
    }
  }
  return true;
}

/**
 * The workflow and every workflow it runs, directly or through others;
 * `undefined` when one of them didn't parse or they run each other in a loop.
 */
function reachedWorkflows(
  start: string,
  workflows: ReadonlyMap<string, Workflow["value"]>,
): string[] | undefined {
  const runs = (id: string) =>
    Object.values(workflows.get(id)?.states ?? {}).flatMap((state) =>
      state.workflow === undefined ? [] : [state.workflow],
    );
  const reached = [start];
  for (let index = 0; index < reached.length; index += 1) {
    const id = reached[index] ?? "";
    if (!workflows.has(id) || runs(id).includes(id)) {
      return undefined;
    }
    reached.push(...new Set(runs(id).filter((to) => !reached.includes(to))));
  }
  return findLoops(reached, runs).length === 0 ? reached : undefined;
}

/** The agent calls of one state: its own, and one per parallel branch. */
function stepsOf(state: WorkflowState): { agent: string; ownOutput: boolean }[] {
  const steps: { agent: string; ownOutput: boolean }[] = [];
  if (state.agent !== undefined) {
    steps.push({
      agent: state.agent,
      ownOutput: state.method === undefined && state.format === undefined,
    });
  }
  for (const branch of Object.values<Branch>(state.branches ?? {})) {
    steps.push({ agent: branch.agent, ownOutput: branch.method === undefined });
  }
  return steps;
}
