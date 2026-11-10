import { childInput, promptFor, withGets } from "@halonicjs/workflow";
import { agentCallEffect } from "../../kernel/agent-call.ts";
import type { DecidedEvent, Effect } from "../../kernel/decide-types.ts";
import type { StateContext } from "../../kernel/registry.ts";
import { maxChildDepth } from "../workflow/state.ts";

/** The name an item has in templates when the state gives no `as`. */
export const defaultItemName = "item";

/** What runs for each item: the state's agent, or a child run of its workflow. */
export type ItemWork = { readonly agent: string } | { readonly workflow: string };

/** How one item starts: the event to record and the effect to ask for. */
export interface ItemStart {
  readonly event: DecidedEvent;
  readonly effect: Effect;
}

/**
 * What the state runs for each item, or why it can't run it: a workflow
 * must be among the definitions the run started with, and its child runs
 * nest at most {@link maxChildDepth} deep, as a `workflow` state's do.
 */
export function itemWorkOf({ run, stateId, state, workflows }: StateContext): ItemWork | string {
  const workflow = state.workflow;
  if (workflow === undefined) {
    return state.agent === undefined
      ? `For-each state "${stateId}" names no agent or workflow.`
      : { agent: state.agent };
  }
  if (!Object.hasOwn(workflows, workflow)) {
    return `Workflow "${workflow}" isn't among the definitions this run started with, so for-each state "${stateId}" can't start it.`;
  }
  const depth = (run.parent?.depth ?? 0) + 1;
  if (depth > maxChildDepth) {
    return `For-each state "${stateId}" would start child runs ${depth} deep; child runs nest at most ${maxChildDepth} deep.`;
  }
  return { workflow };
}

/**
 * Starts one item: a model call for its agent, or a child run of the
 * workflow. The item is named by `as` in templates, with `index` its place
 * in the list. A model call takes the next call id after the `startedBefore`
 * items this step has already started; a child run takes none.
 */
export function startItem(
  context: StateContext,
  work: ItemWork,
  item: unknown,
  index: number,
  startedBefore: number,
): ItemStart {
  const name = context.state.as ?? defaultItemName;
  const itemScope = { ...context.scope, [name]: item, index };
  if ("workflow" in work) {
    return startChild(context, work.workflow, { [name]: item }, itemScope, index);
  }
  const { run, stateId, state, agents } = context;
  const agent = work.agent;
  const callId = `call-${run.calls + startedBefore + 1}`;
  const prompt =
    state.input === undefined
      ? asText(item)
      : withGets(promptFor(state.input, itemScope, run.input), state.gets, itemScope);
  return {
    event: { type: "agent.started", state: stateId, agent, prompt, item: index },
    effect: agentCallEffect(run, agents, { callId, state: stateId, agent, prompt }),
  };
}

/** With no `input`, the child gets `{ <as>: item }`. */
function startChild(
  { run, stateId, state }: StateContext,
  workflowId: string,
  named: Record<string, unknown>,
  itemScope: Record<string, unknown>,
  index: number,
): ItemStart {
  // The visit's `seq` and the item make the id unique in the run, so a start
  // asked for twice finds the same child.
  const childRunId = `${run.runId}.${run.enteredSeq}.${index}`;
  const input = state.input === undefined ? named : childInput(state.input, itemScope);
  return {
    event: {
      type: "workflow.started",
      state: stateId,
      workflow: workflowId,
      childRunId,
      item: index,
    },
    effect: {
      type: "start-child",
      childRunId,
      state: stateId,
      workflowId,
      input,
      depth: (run.parent?.depth ?? 0) + 1,
    },
  };
}

/** An item as the agent gets it with no `input`: a text as it is, anything else as JSON. */
function asText(item: unknown): string {
  return typeof item === "string" ? item : (JSON.stringify(item) ?? "null");
}
