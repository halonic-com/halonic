import type { Workflow } from "@halonicjs/format";
import { hasState } from "./machine.ts";
import { STATE_CHECKS } from "./state-checks.ts";
import { issue, type ValidateOptions, type WorkflowIssue } from "./workflow-issue.ts";

/**
 * The static checks a workflow gets before anything runs, as the Studio's
 * canvas shows them: states it names but doesn't have, dead ends,
 * unreachable states, steps missing what their type needs, unknown agents
 * and workflows, timers outside wait states, transitions that can never
 * fire, and picked data no earlier step writes.
 */
export function validateWorkflow(
  workflow: Workflow,
  options: ValidateOptions = {},
): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  if (!hasState(workflow, workflow.initial)) {
    issues.push(
      issue("error", "missing-initial", `Initial state "${workflow.initial}" does not exist`),
    );
  }
  for (const [id, state] of Object.entries(workflow.states)) {
    for (const check of STATE_CHECKS) {
      issues.push(...check({ workflow, id, state, options }));
    }
  }
  issues.push(...unreachableStates(workflow));
  if (!Object.values(workflow.states).some((state) => state.type === "final")) {
    issues.push(issue("warning", "no-final", "Workflow has no final state"));
  }
  return issues;
}

/** States no path of transitions reaches from the initial state. Nothing is checked without one. */
function unreachableStates(workflow: Workflow): WorkflowIssue[] {
  if (!hasState(workflow, workflow.initial)) {
    return [];
  }
  const reached = new Set([workflow.initial]);
  const queue = [workflow.initial];
  for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
    for (const transition of workflow.states[current]?.on ?? []) {
      if (hasState(workflow, transition.to) && !reached.has(transition.to)) {
        reached.add(transition.to);
        queue.push(transition.to);
      }
    }
  }
  return Object.keys(workflow.states)
    .filter((id) => !reached.has(id))
    .map((id) => issue("warning", "unreachable", `"${id}" can never be reached`, id));
}
