import type { Workflow, WorkflowState } from "@halonicjs/format";
import { contextBefore } from "./inputs.ts";
import { hasState } from "./machine.ts";
import { issue, stateKey, type ValidateOptions, type WorkflowIssue } from "./workflow-issue.ts";

// The checks validateWorkflow runs on each state, one function per rule, in
// the order the old checks reported them.

/** One state, with what every check of a state needs. */
export interface StateToCheck {
  workflow: Workflow;
  id: string;
  state: WorkflowState;
  options: ValidateOptions;
}

/** One rule: the issues it finds in a state. */
export type StateCheck = (target: StateToCheck) => WorkflowIssue[];

const unknownTargets: StateCheck = ({ workflow, id, state }) =>
  state.on.flatMap((transition, index) => {
    if (hasState(workflow, transition.to)) {
      return [];
    }
    const message = `"${id}" goes to unknown state "${transition.to}"`;
    return [issue("error", "unknown-target", message, stateKey(id, "on", index, "to"), id)];
  });

const finalWithTransitions: StateCheck = ({ id, state }) =>
  state.type === "final" && state.on.length > 0
    ? [
        issue(
          "warning",
          "final-has-transitions",
          `Final state "${id}" has transitions that never fire`,
          stateKey(id, "on"),
          id,
        ),
      ]
    : [];

const deadEnd: StateCheck = ({ id, state }) =>
  state.type !== "final" && state.on.length === 0
    ? [
        issue(
          "error",
          "dead-end",
          `"${id}" has no way out; add a transition or make it final`,
          stateKey(id),
          id,
        ),
      ]
    : [];

/** A picked `context.<key>` must be in the initial context or written by a state that runs earlier. */
const unknownGets: StateCheck = ({ workflow, id, state }) => {
  if (!state.gets?.length) {
    return [];
  }
  const known = contextBefore(workflow, id);
  return state.gets.flatMap((path, index) => {
    const key = contextKey(path);
    if (key === null || known.includes(key)) {
      return [];
    }
    const message = `"${id}" gets ${path}, but no earlier step writes context.${key}`;
    return [issue("error", "unknown-gets", message, stateKey(id, "gets", index), id)];
  });
};

const taskWithoutAgent: StateCheck = ({ id, state }) =>
  state.type === "task" && !state.agent
    ? [
        issue(
          "warning",
          "task-without-agent",
          `Task "${id}" has no agent; it passes straight through`,
          stateKey(id),
          id,
        ),
      ]
    : [];

const timersOutsideWait: StateCheck = ({ id, state }) =>
  state.type === "wait"
    ? []
    : state.on.flatMap((transition, index) =>
        transition.after
          ? [
              issue(
                "error",
                "timer-outside-wait",
                `"${id}" has a timer (after ${transition.after}); timers only work on wait states`,
                stateKey(id, "on", index, "after"),
                id,
              ),
            ]
          : [],
      );

const waitWithoutEvents: StateCheck = ({ id, state }) => {
  const onlyDone = state.on.every((transition) => transition.event === "done" && !transition.after);
  if (state.type !== "wait" || !onlyDone) {
    return [];
  }
  const message = `Wait state "${id}" only listens to "done"; give it named events like "approve"`;
  return [issue("warning", "wait-without-events", message, stateKey(id), id)];
};

const foreachShape: StateCheck = ({ id, state }) => {
  if (state.type !== "foreach") {
    return [];
  }
  const issues: WorkflowIssue[] = [];
  if (!state.items) {
    const message = `For-each step "${id}" needs items, e.g. "{{context.list}}"`;
    issues.push(issue("error", "foreach-without-items", message, stateKey(id), id));
  }
  // Exactly one of the two: both, or neither, is wrong.
  if (!state.agent === !state.workflow) {
    const message = `For-each step "${id}" needs either an agent or a workflow (one of them)`;
    issues.push(issue("error", "foreach-without-work", message, stateKey(id), id));
  }
  return issues;
};

const subflowTarget: StateCheck = ({ workflow, id, state, options }) => {
  if ((state.type !== "workflow" && state.type !== "foreach") || !state.workflow) {
    return [];
  }
  if (state.workflow === workflow.id) {
    const message = `"${id}" runs its own workflow`;
    return [issue("error", "self-subflow", message, stateKey(id, "workflow"), id)];
  }
  if (options.workflows && !options.workflows.includes(state.workflow)) {
    const message = `"${id}" runs unknown workflow "${state.workflow}"`;
    return [issue("error", "unknown-workflow", message, stateKey(id, "workflow"), id)];
  }
  return [];
};

const workflowWithoutTarget: StateCheck = ({ id, state }) =>
  state.type === "workflow" && !state.workflow
    ? [
        issue(
          "error",
          "workflow-without-target",
          `"${id}" runs a workflow but does not say which`,
          stateKey(id),
          id,
        ),
      ]
    : [];

const parallelShape: StateCheck = ({ id, state, options }) => {
  if (state.type !== "parallel") {
    return [];
  }
  const branches = Object.entries(state.branches ?? {});
  const issues: WorkflowIssue[] = [];
  if (branches.length === 0) {
    const message = `Parallel step "${id}" has no branches`;
    issues.push(issue("error", "parallel-without-branches", message, stateKey(id), id));
  }
  for (const [name, branch] of branches) {
    if (options.agents && !options.agents.includes(branch.agent)) {
      const message = `Branch "${name}" of "${id}" uses unknown agent "${branch.agent}"`;
      const path = stateKey(id, "branches", name, "agent");
      issues.push(issue("error", "unknown-agent", message, path, id));
    }
  }
  return issues;
};

const unknownAgent: StateCheck = ({ id, state, options }) => {
  if (!state.agent || !options.agents || options.agents.includes(state.agent)) {
    return [];
  }
  const message = `"${id}" uses unknown agent "${state.agent}"`;
  return [issue("error", "unknown-agent", message, stateKey(id, "agent"), id)];
};

/** A transition after an unguarded one on the same event is hidden by it. */
const unguardedShadow: StateCheck = ({ id, state }) => {
  const unguarded = new Set<string>();
  const issues: WorkflowIssue[] = [];
  for (const [index, transition] of state.on.entries()) {
    if (transition.after) {
      continue;
    }
    if (unguarded.has(transition.event)) {
      const message = `In "${id}", the transition to "${transition.to}" can never fire: an earlier one on "${transition.event}" has no condition`;
      issues.push(issue("warning", "unguarded-shadow", message, stateKey(id, "on", index), id));
    }
    if (!transition.when) {
      unguarded.add(transition.event);
    }
  }
  return issues;
};

/** The checks run on every state, in this order. */
export const STATE_CHECKS: readonly StateCheck[] = [
  unknownTargets,
  finalWithTransitions,
  deadEnd,
  unknownGets,
  taskWithoutAgent,
  timersOutsideWait,
  waitWithoutEvents,
  foreachShape,
  subflowTarget,
  workflowWithoutTarget,
  parallelShape,
  unknownAgent,
  unguardedShadow,
];

/** `"context.tags.0"` as `"tags"`; `null` for a path outside the context. */
function contextKey(path: string): string | null {
  if (!path.startsWith("context.")) {
    return null;
  }
  return path.slice("context.".length).split(".")[0] ?? null;
}
