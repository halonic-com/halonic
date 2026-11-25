import type { StateType, Workflow, WorkflowState } from "@halonicjs/format";
import { contextBefore } from "./inputs.ts";
import { hasState } from "./machine.ts";
import { didYouMean } from "./near-name.ts";
import {
  foreachItems,
  noDoneTransition,
  ruleWithoutFileOrOutput,
  taskWithoutAgent,
  toolWithoutTarget,
} from "./run-failure-checks.ts";
import { type StateKey, typesUsing, usesKey } from "./state-keys.ts";
import {
  contextKey,
  notAChoice,
  unknownItemNames,
  unknownTemplateNames,
} from "./template-checks.ts";
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
    const guess = didYouMean(transition.to, Object.keys(workflow.states));
    const message = `"${id}" goes to the step "${transition.to}", which this workflow doesn't have${guess}`;
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
  const known = contextBefore(workflow, id, { followGuesses: true });
  return state.gets.flatMap((path, index) => {
    const key = contextKey(path);
    if (key === null || known.includes(key)) {
      return [];
    }
    const message = `"${id}" gets ${path}, but no earlier step writes context.${key}`;
    return [issue("error", "unknown-gets", message, stateKey(id, "gets", index), id)];
  });
};

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

/**
 * A timer never fires on an event, so a named event next to `after` would be
 * silently dropped: `--event approve` is then refused at run time. "done" is
 * the default event, so it is what a plain timer has.
 */
const timerWithEvent: StateCheck = ({ id, state }) =>
  state.on.flatMap((transition, index) =>
    transition.after && transition.event !== "done"
      ? [
          issue(
            "error",
            "timer-with-event",
            `In "${id}", the transition to "${transition.to}" has both event "${transition.event}" and a timer (after ${transition.after}); a timer never fires on an event. Keep one of the two, or split it into two transitions if both are wanted`,
            stateKey(id, "on", index, "event"),
            id,
          ),
        ]
      : [],
  );

/**
 * A timer is not an answer, so it is left out: a wait with a timer and a
 * transition without event still offers a person only "done" (HAL-15648). A
 * wait with only timers is a pause, which asks nobody anything.
 */
const waitWithoutEvents: StateCheck = ({ id, state }) => {
  const answers = state.on.filter((transition) => !transition.after);
  const onlyDone = answers.every((transition) => transition.event === "done");
  const onlyTimers = state.on.length > 0 && answers.length === 0;
  if (state.type !== "wait" || !onlyDone || onlyTimers) {
    return [];
  }
  const message = `Wait state "${id}" only listens to "done"; give it named events like "approve"`;
  return [issue("warning", "wait-without-events", message, stateKey(id), id)];
};

/**
 * A transition without `event` takes the default event `done`, which a wait
 * never ends with: it is taken only when someone answers "done". Next to named
 * events that is a slip, a missing `event: reject` say (HAL-15590). A wait with
 * no named events, timers aside, gets `wait-without-events` instead, once for
 * the step.
 */
const waitArrowWithoutEvent: StateCheck = ({ id, state }) => {
  const named = state.on.some((transition) => transition.event !== "done" && !transition.after);
  if (state.type !== "wait" || !named) {
    return [];
  }
  return state.on.flatMap((transition, index) =>
    transition.event === "done" && !transition.after
      ? [
          issue(
            "warning",
            "wait-arrow-without-event",
            `In "${id}", the transition to "${transition.to}" has no event, so a person must answer "done" to take it. Name the answer it is for, like "reject", or give it a timer`,
            stateKey(id, "on", index),
            id,
          ),
        ]
      : [],
  );
};

/**
 * A wait step has no moment to send a signal at (on entry? on each event?),
 * so `signal` there would be silently dropped (HAL-14305).
 */
const waitWithSignal: StateCheck = ({ id, state }) => {
  if (state.type !== "wait" || state.signal === undefined) {
    return [];
  }
  const message = `Wait step "${id}" can't send a signal. Put signal: on the step after it.`;
  return [issue("error", "wait-with-signal", message, stateKey(id, "signal"), id)];
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
      const message = `Branch "${name}" of "${id}" uses ${missingAgent(branch.agent, options)}`;
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
  const message = `"${id}" uses ${missingAgent(state.agent, options)}`;
  return [issue("error", "unknown-agent", message, stateKey(id, "agent"), id)];
};

/**
 * The words for an agent the workflow's hub doesn't have. They hold both when
 * no hub has it and when another hub does, as the hint that follows says.
 */
function missingAgent(agent: string, options: ValidateOptions): string {
  return `the agent "${agent}", which its hub doesn't have${agentHint(agent, options)}`;
}

/**
 * What follows an unknown agent's message: the hub it is in, when it is
 * another hub's, or else "Did you mean" for a close name of the hub's own.
 */
function agentHint(agent: string, options: ValidateOptions): string {
  const hub = options.agentHubs?.[agent];
  if (hub !== undefined) {
    return `. ${agent} is in the hub ${hub}; a workflow can only use its own hub's agents.`;
  }
  return didYouMean(agent, options.agents ?? []);
}

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

/** How a message names a state type: "a for-each step". */
const typeNames: { readonly [Type in StateType]: string } = {
  task: "task",
  wait: "wait",
  final: "final",
  workflow: "workflow",
  parallel: "parallel",
  foreach: "for-each",
  rule: "rule",
  tool: "tool",
};

/**
 * A key the state's type doesn't use is ignored when it runs, and the file's
 * one shape for every type lets it through: one warning per key, saying
 * which types use it. The keys each type uses are the engine's (`STATE_KEYS`).
 */
const ignoredKeys: StateCheck = ({ id, state }) =>
  (Object.keys(state) as StateKey[])
    .filter((key) => state[key] !== undefined && !usesKey(state.type, key))
    .filter((key) => !refusedKeys[state.type]?.includes(key))
    .map((key) => {
      const message = `"${id}" is a ${typeNames[state.type]} step: ${key} is ignored. ${whereKeyBelongs(state.type, key)}`;
      return issue("warning", "ignored-key", message, stateKey(id, key), id);
    });

/**
 * Keys a type doesn't use that another check refuses with an error, so the
 * user gets that error alone and not an `ignored-key` warning as well.
 */
const refusedKeys: Partial<Record<StateType, readonly StateKey[]>> = {
  wait: ["signal"], // wait-with-signal
};

/** What to do with a key a state of `type` ignores. */
function whereKeyBelongs(type: StateType, key: StateKey): string {
  if (key === "agent" && (type === "wait" || type === "final")) {
    return "Put the agent on a task step before it.";
  }
  const users = typesUsing(key).map((user) => typeNames[user]);
  return `Only ${spokenList(users)} steps use it; remove it here.`;
}

/** `["a", "b", "c"]` as "a, b and c". */
function spokenList(items: readonly string[]): string {
  const last = items.at(-1) ?? "";
  return items.length <= 1 ? last : `${items.slice(0, -1).join(", ")} and ${last}`;
}

/**
 * `with` holds a method's arguments, so a step or branch without `method` ignores it. A tool
 * step's `with` holds its tool's arguments, so it needs no method.
 */
const withWithoutMethod: StateCheck = ({ id, state }) => {
  const issues: WorkflowIssue[] = [];
  const takesMethod = usesKey(state.type, "with") && state.type !== "tool";
  if (takesMethod && state.with !== undefined && state.method === undefined) {
    const message = `"${id}" has with but no method: with is ignored. Add the method it is for, or put the text in input.`;
    issues.push(issue("warning", "ignored-key", message, stateKey(id, "with"), id));
  }
  for (const [name, branch] of Object.entries(state.branches ?? {})) {
    if (branch.with !== undefined && branch.method === undefined) {
      const message = `Branch "${name}" of "${id}" has with but no method: with is ignored. Add the method it is for, or put the text in input.`;
      const path = stateKey(id, "branches", name, "with");
      issues.push(issue("warning", "ignored-key", message, path, id));
    }
  }
  return issues;
};

/** With `join: any` the step fails only when every branch fails, so `continueOnError` changes nothing. */
const continueOnErrorWithAny: StateCheck = ({ id, state }) =>
  state.type === "parallel" && state.join === "any" && state.continueOnError !== undefined
    ? [
        issue(
          "warning",
          "ignored-key",
          `"${id}" has join: any, so continueOnError is ignored. Remove it, or use join: all.`,
          stateKey(id, "continueOnError"),
          id,
        ),
      ]
    : [];

/** The checks run on every state, in this order. */
export const STATE_CHECKS: readonly StateCheck[] = [
  unknownTargets,
  finalWithTransitions,
  deadEnd,
  unknownGets,
  unknownTemplateNames,
  taskWithoutAgent,
  ruleWithoutFileOrOutput,
  toolWithoutTarget,
  timersOutsideWait,
  timerWithEvent,
  waitWithoutEvents,
  waitArrowWithoutEvent,
  waitWithSignal,
  foreachShape,
  subflowTarget,
  workflowWithoutTarget,
  parallelShape,
  unknownAgent,
  unguardedShadow,
  notAChoice,
  ignoredKeys,
  withWithoutMethod,
  continueOnErrorWithAny,
  unknownItemNames,
  foreachItems,
  noDoneTransition,
];
