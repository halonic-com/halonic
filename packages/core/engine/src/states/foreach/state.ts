import { promptFor, render, withGets } from "@halonicjs/workflow";
import { agentCallEffect } from "../../kernel/agent-call.ts";
import type { DecidedEvent, Effect, EffectDoneInput } from "../../kernel/decide-types.ts";
import {
  nothing,
  type StateContext,
  type StateHandler,
  type StateStep,
} from "../../kernel/registry.ts";
import type { RunningItem } from "../../kernel/run-items.ts";

/** The name an item has in templates when the state gives no `as`. */
export const defaultItemName = "item";

/**
 * A `foreach` state runs its agent once for each item of a list: `items`,
 * rendered against the scope. Each item is named by `as` (default `item`)
 * in templates, with `index` its 0-based place. At most `concurrency` items
 * run at once (default 1), and they start in list order. Each item's events
 * carry `item`. Once every item has ended, the results go to `output` as a
 * list in item order and the state finishes with `done`. The first item
 * that fails fails the run, and an item agent can't pause for an approval.
 * Items that run a workflow join with the second part of step 5(c).
 */
export const foreachState: StateHandler<"foreach"> = {
  type: "foreach",
  enter: startItems,
  onInput: (context, input) => {
    if (input.type === "effect-done") return takeItemResult(context, input);
    return nothing;
  },
};

/** The list the state goes through, or why it has none. */
type ItemList = { readonly items: readonly unknown[] } | { readonly error: string };

function startItems(context: StateContext): StateStep {
  const { stateId, state } = context;
  if (state.workflow !== undefined) {
    return failed(`The engine can't run for-each items of a workflow yet (state "${stateId}").`);
  }
  if (state.agent === undefined) {
    return failed(`For-each state "${stateId}" names no agent or workflow.`);
  }
  const list = itemsOf(context);
  if ("error" in list) {
    return failed(list.error);
  }
  if (list.items.length === 0) {
    return finishState(context, 0, null, null, []);
  }
  return startMore(context, state.agent, list.items, 0, []);
}

/** Only the result of an item's call counts; any other result changes nothing. */
function takeItemResult(context: StateContext, input: EffectDoneInput): StateStep {
  const running = context.run.foreach?.running.find((item) => item.call.callId === input.callId);
  if (running === undefined || running.call.state !== context.stateId) {
    return nothing;
  }
  const result = input.result;
  if (result.type === "approval") {
    return failed(
      `Agent "${running.call.agent}" stopped for an approval of "${result.tool}" in item ${running.item} of for-each state "${context.stateId}"; an item's agent can't wait for one.`,
    );
  }
  // A run records one connector call that can change things at a time, so an
  // item can't stop at that boundary while the others go on.
  if (result.type === "effect") {
    return failed(
      `Agent "${running.call.agent}" stopped before a call to tool "${result.tool}" that can change things in item ${running.item} of for-each state "${context.stateId}"; an item's agent can't make one.`,
    );
  }
  if (result.type === "tool") {
    return nothing;
  }
  return takeItemOutput(context, running, result.output);
}

function takeItemOutput(context: StateContext, running: RunningItem, output: unknown): StateStep {
  const list = itemsOf(context);
  if ("error" in list) {
    return failed(list.error);
  }
  const finished: DecidedEvent = {
    type: "agent.finished",
    state: context.stateId,
    agent: running.call.agent,
    output,
    item: running.item,
  };
  const step = startMore(context, running.call.agent, list.items, 1, [finished]);
  if (step.effects.length > 0 || stillRunning(context) > 1) {
    return step;
  }
  return finishState(context, list.items.length, running, output, step.events);
}

/**
 * Starts the next items until `concurrency` run, after `finished` items of
 * those running now have ended in this step.
 */
function startMore(
  context: StateContext,
  agent: string,
  items: readonly unknown[],
  finished: number,
  events: readonly DecidedEvent[],
): StateStep {
  const { run, state } = context;
  const concurrency = state.concurrency ?? 1;
  const first = run.foreach?.started ?? 0;
  const free = concurrency - (stillRunning(context) - finished);
  const effects: Effect[] = [];
  const started = [...events];
  for (let index = first; index < items.length && index < first + free; index += 1) {
    const callId = `call-${run.calls + effects.length + 1}`;
    const { event, effect } = startItemCall(context, agent, items[index], index, callId);
    started.push(event);
    effects.push(effect);
  }
  return { events: started, effects };
}

function startItemCall(
  { run, stateId, state, scope, agents }: StateContext,
  agent: string,
  item: unknown,
  index: number,
  callId: string,
): { event: DecidedEvent; effect: Effect } {
  const itemScope = { ...scope, [state.as ?? defaultItemName]: item, index };
  const prompt =
    state.input === undefined
      ? asText(item)
      : withGets(promptFor(state.input, itemScope, run.input), state.gets, itemScope);
  return {
    event: { type: "agent.started", state: stateId, agent, prompt, item: index },
    effect: agentCallEffect(agents, { callId, state: stateId, agent, prompt }),
  };
}

/** Every item has ended: the results go to `output`, in item order, and the state is done. */
function finishState(
  { run, state }: StateContext,
  count: number,
  last: RunningItem | null,
  output: unknown,
  events: readonly DecidedEvent[],
): StateStep {
  const done = run.foreach?.results ?? [];
  const results = Array.from({ length: count }, (_, index) =>
    index === last?.item ? output : (done[index] ?? null),
  );
  const written: DecidedEvent[] =
    state.output === undefined
      ? []
      : [{ type: "context.updated", key: state.output, value: results }];
  return {
    events: [...events, ...written],
    effects: [],
    outcome: { type: "finish", event: "done" },
  };
}

function stillRunning({ run, stateId }: StateContext): number {
  return run.foreach?.state === stateId ? run.foreach.running.length : 0;
}

function itemsOf({ stateId, state, scope }: StateContext): ItemList {
  if (state.items === undefined) {
    return { error: `For-each state "${stateId}" names no items.` };
  }
  const items = render(state.items, scope);
  if (!Array.isArray(items)) {
    return {
      error: `The items of for-each state "${stateId}" ("${state.items}") give ${kindOf(items)}, not a list.`,
    };
  }
  return { items };
}

function kindOf(value: unknown): string {
  if (value === undefined || value === null) return "nothing";
  if (typeof value === "string") return "a text";
  return typeof value === "object" ? "an object" : `a ${typeof value}`;
}

/** An item as the agent gets it with no `input`: a text as it is, anything else as JSON. */
function asText(item: unknown): string {
  return typeof item === "string" ? item : (JSON.stringify(item) ?? "null");
}

function failed(error: string): StateStep {
  return { ...nothing, outcome: { type: "fail", error } };
}
