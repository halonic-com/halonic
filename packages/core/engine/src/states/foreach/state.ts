import { render } from "@halonicjs/workflow";
import type {
  ChildInput,
  DecidedEvent,
  Effect,
  EffectDoneInput,
} from "../../kernel/decide-types.ts";
import {
  nothing,
  type StateContext,
  type StateHandler,
  type StateStep,
} from "../../kernel/registry.ts";
import type { RunningItem } from "../../kernel/run-items.ts";
import { type ItemWork, itemWorkOf, startItem } from "./item-start.ts";

/**
 * A `foreach` state runs its agent, or a child run of its workflow, once
 * for each item of a list: `items`, rendered against the scope. Each item is
 * named by `as` (default `item`) in templates, with `index` its 0-based
 * place. At most `concurrency` items run at once (default 1), and they start
 * in list order. Each item's events carry `item`. Once every item has ended,
 * the results go to `output` as a list in item order and the state finishes
 * with `done`. The first item that fails fails the run; an item's child run
 * its budget stopped stops this run for its budget too. An item's agent
 * can't pause for an approval, and an item's child run can't wait.
 */
export const foreachState: StateHandler<"foreach"> = {
  type: "foreach",
  enter: startItems,
  onInput: (context, input) => {
    if (input.type === "effect-done") return takeCallResult(context, input);
    if (input.type === "child") return takeChildNews(context, input);
    return nothing;
  },
};

/** The list the state goes through, or why it has none. */
type ItemList = { readonly items: readonly unknown[] } | { readonly error: string };

function startItems(context: StateContext): StateStep {
  const work = itemWorkOf(context);
  if (typeof work === "string") {
    return failed(work);
  }
  const list = itemsOf(context);
  if ("error" in list) {
    return failed(list.error);
  }
  if (list.items.length === 0) {
    return finishState(context, 0, null, null, []);
  }
  return startMore(context, work, list.items, 0, []);
}

/** Only the result of an item's call counts; any other result changes nothing. */
function takeCallResult(context: StateContext, input: EffectDoneInput): StateStep {
  const running = runningItem(
    context,
    (item) => "call" in item && item.call.callId === input.callId,
  );
  if (running === undefined || !("call" in running)) {
    return nothing;
  }
  const { agent } = running.call;
  const result = input.result;
  if (result.type === "approval") {
    return failed(
      `Agent "${agent}" stopped for an approval of "${result.tool}" in item ${running.item} of for-each state "${context.stateId}"; an item's agent can't wait for one.`,
    );
  }
  // A run records one connector call that can change things at a time, so an
  // item can't stop at that boundary while the others go on.
  if (result.type === "effect") {
    return failed(
      `Agent "${agent}" stopped before a call to tool "${result.tool}" that can change things in item ${running.item} of for-each state "${context.stateId}"; an item's agent can't make one.`,
    );
  }
  if (result.type === "tool") {
    return nothing;
  }
  const output = result.output;
  const finished: DecidedEvent = {
    type: "agent.finished",
    state: context.stateId,
    agent,
    output,
    item: running.item,
  };
  return finishItem(context, { agent }, running, output, finished);
}

/** Only news of an item's child run counts; news of any other run changes nothing. */
function takeChildNews(context: StateContext, input: ChildInput): StateStep {
  const running = runningItem(
    context,
    (item) => "childRunId" in item && item.childRunId === input.childRunId,
  );
  if (running === undefined || !("childRunId" in running)) {
    return nothing;
  }
  const { item, childRunId, workflow } = running;
  const where = `item ${item} of for-each state "${context.stateId}"`;
  if (input.status === "waiting") {
    return failed(
      `Workflow "${workflow}" in ${where} waits for ${input.events.join(", ")}; an item's child run must finish without waiting.`,
    );
  }
  const base = {
    type: "workflow.finished" as const,
    state: context.stateId,
    workflow,
    childRunId,
    item,
  };
  if (input.status === "failed") {
    const finished: DecidedEvent = { ...base, status: "failed", error: input.error };
    const error = `Workflow "${workflow}" failed in ${where}: ${input.error}`;
    // As in a `workflow` state, only a budget stop goes up as it is.
    const reason = input.reason === "budget" ? { reason: input.reason } : {};
    return { events: [finished], effects: [], outcome: { type: "fail", error, ...reason } };
  }
  const finished: DecidedEvent = { ...base, status: "completed", context: input.context };
  return finishItem(context, { workflow }, running, input.context, finished);
}

/** An item ended with `output`: start the next ones, or finish the state once none is left. */
function finishItem(
  context: StateContext,
  work: ItemWork,
  running: RunningItem,
  output: unknown,
  finished: DecidedEvent,
): StateStep {
  const list = itemsOf(context);
  if ("error" in list) {
    return failed(list.error);
  }
  const step = startMore(context, work, list.items, 1, [finished]);
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
  work: ItemWork,
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
    const { event, effect } = startItem(context, work, items[index], index, effects.length);
    started.push(event);
    effects.push(effect);
  }
  return { events: started, effects };
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

function runningItem(
  { run, stateId }: StateContext,
  matches: (item: RunningItem) => boolean,
): RunningItem | undefined {
  return run.foreach?.state === stateId ? run.foreach.running.find(matches) : undefined;
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

function failed(error: string): StateStep {
  return { ...nothing, outcome: { type: "fail", error } };
}
