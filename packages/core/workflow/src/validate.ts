import type { Workflow } from "@halonicjs/format";
import { inputIssues } from "./input-checks.ts";
import { hasState } from "./machine.ts";
import { likelyName } from "./near-name.ts";
import { STATE_CHECKS } from "./state-checks.ts";
import { issue, stateKey, type ValidateOptions, type WorkflowIssue } from "./workflow-issue.ts";

/**
 * The static checks a workflow gets before anything runs, as the Studio's
 * canvas shows them: states it names but doesn't have, dead ends,
 * unreachable states, steps missing what their type needs, unknown agents
 * and workflows, timers outside wait states, transitions that can never
 * fire, picked data no earlier step writes, input fields the workflow's
 * input doesn't have, a `start.field` no step reads and keys a step's type
 * ignores.
 */
export function validateWorkflow(
  workflow: Workflow,
  options: ValidateOptions = {},
): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  if (!hasState(workflow, workflow.initial)) {
    const message = `Initial state "${workflow.initial}" does not exist`;
    issues.push(issue("error", "missing-initial", message, ["initial"]));
  }
  for (const [id, state] of Object.entries(workflow.states)) {
    for (const check of STATE_CHECKS) {
      issues.push(...check({ workflow, id, state, options }));
    }
  }
  issues.push(...inputIssues(workflow, options));
  issues.push(...unreachableStates(workflow));
  if (!Object.values(workflow.states).some((state) => state.type === "final")) {
    issues.push(issue("warning", "no-final", "Workflow has no final state", []));
  }
  return issues;
}

/**
 * States no path of transitions reaches from the initial state. Nothing is
 * checked without one. A transition to an unknown state counts as going to
 * the state its "Did you mean" names: a misspelled `to:` already has its
 * error, and the states after it aren't warned about too (HAL-14277).
 */
function unreachableStates(workflow: Workflow): WorkflowIssue[] {
  if (!hasState(workflow, workflow.initial)) {
    return [];
  }
  const stateIds = Object.keys(workflow.states);
  const reached = new Set([workflow.initial]);
  const queue = [workflow.initial];
  for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
    for (const transition of workflow.states[current]?.on ?? []) {
      const to = hasState(workflow, transition.to)
        ? transition.to
        : likelyName(transition.to, stateIds);
      if (to !== undefined && !reached.has(to)) {
        reached.add(to);
        queue.push(to);
      }
    }
  }
  return Object.keys(workflow.states)
    .filter((id) => !reached.has(id))
    .map((id) => issue("warning", "unreachable", `"${id}" can never be reached`, stateKey(id), id));
}
