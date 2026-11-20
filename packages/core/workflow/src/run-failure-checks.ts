import type { WorkflowState } from "@halonicjs/format";
import type { StateCheck } from "./state-checks.ts";
import { wholePlaceholderPath } from "./template.ts";
import { orList, SCOPE_ROOTS } from "./template-checks.ts";
import { issue, stateKey, type WorkflowIssue } from "./workflow-issue.ts";

// The checks of mistakes the engine fails a run on, every time, with a cause
// the person can't act on (C340 C35–C37, HAL-14303). Found before the run,
// they name the line and the fix. The texts match the run's causes
// (`run-failures.ts` in the CLI, C29).

/** The event a step that isn't a wait step ends with when its work is done (the engine's `finish`). */
const DONE_EVENT = "done";

/**
 * A for-each step's `items` must be one placeholder of `input` or `context`:
 * only a whole placeholder keeps a list a list, and any other name gives
 * nothing. The engine fails the run on both. Whether the run's input gives
 * a list is only known when it runs, so `{{input.<name>}}` passes here.
 */
export const foreachItems: StateCheck = ({ id, state }) => {
  if (state.type !== "foreach" || !state.items) {
    return [];
  }
  const items = state.items;
  const path = wholePlaceholderPath(items);
  let message: string | undefined;
  if (path === undefined) {
    message = `"${id}" goes through "${items}", which is a text, not a list. Write one placeholder, such as "{{context.topics}}".`;
  } else if (!SCOPE_ROOTS.includes(path.split(".")[0] ?? "")) {
    message = `"${id}" goes through {{${path}}}, which gives nothing. Read the list from input or context, such as "{{context.${path}}}".`;
  }
  return message === undefined
    ? []
    : [issue("error", "items-not-a-list", message, stateKey(id, "items"), id)];
};

/**
 * A step that isn't a wait step ends with the event `done`. When none of its
 * transitions takes `done`, every run fails as the step ends.
 */
export const noDoneTransition: StateCheck = ({ id, state }) => {
  if (!endsWithDone(state)) {
    return [];
  }
  const onEvents = state.on
    .map((transition, index) => ({ event: transition.event, index, timer: !!transition.after }))
    .filter(({ timer }) => !timer);
  const [first] = onEvents;
  if (first === undefined || onEvents.some(({ event }) => event === DONE_EVENT)) {
    return [];
  }
  const events = [...new Set(onEvents.map(({ event }) => event))];
  const fix = events.length === 1 ? `Remove event: ${events[0]}` : "Remove their event";
  const message = `"${id}" ends with the event ${DONE_EVENT}, but its transitions only take ${orList(events)}. ${fix}, or add a transition without event.`;
  return [
    issue("error", "no-done-transition", message, stateKey(id, "on", first.index, "event"), id),
  ];
};

/** A step whose work ends with `done`: any but a wait step, which takes named events, and an end. */
function endsWithDone(state: WorkflowState): boolean {
  return state.type !== "wait" && state.type !== "final";
}

/** The engine fails a task step with no agent as soon as it is entered. */
export const taskWithoutAgent: StateCheck = ({ id, state }): WorkflowIssue[] =>
  state.type === "task" && !state.agent
    ? [
        issue(
          "error",
          "task-without-agent",
          `Task "${id}" names no agent, so every run fails there. Give it an agent (agent: <id>), or make it a wait step.`,
          stateKey(id),
          id,
        ),
      ]
    : [];
