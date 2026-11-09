import { promptFor, withGets } from "@halonicjs/workflow";
import type { DecidedEvent, DecideInput } from "../../kernel/decide-types.ts";
import {
  nothing,
  type StateContext,
  type StateHandler,
  type StateStep,
} from "../../kernel/registry.ts";
import { nextCallId } from "../../kernel/run-state.ts";

/**
 * A plain `task` state runs its agent once on entry: it asks for one model
 * call with the state's prompt, and finishes with `done` when the answer
 * comes back. Tool calls, methods, conversations, artifacts and signals
 * join with the agent loop (step 4).
 */
export const taskState: StateHandler<"task"> = {
  type: "task",
  enter: startAgent,
  onInput: finishAgent,
};

function startAgent({ run, stateId, state, scope }: StateContext): StateStep {
  const agent = state.agent;
  if (agent === undefined) {
    return {
      ...nothing,
      outcome: { type: "fail", error: `Task state "${stateId}" names no agent.` },
    };
  }
  const prompt = withGets(promptFor(state.input, scope, run.input), state.gets, scope);
  return {
    events: [{ type: "agent.started", state: stateId, agent, prompt }],
    effects: [{ type: "call-model", callId: nextCallId(run), state: stateId, agent, prompt }],
  };
}

/**
 * Only the answer to the call the state waits on counts. Any other result,
 * such as one delivered twice after a retry, changes nothing.
 */
function finishAgent({ run, stateId, state }: StateContext, input: DecideInput): StateStep {
  const pending = run.pendingCall;
  if (input.type !== "effect-done" || input.result.type !== "model") {
    return nothing;
  }
  if (pending === null || pending.state !== stateId || pending.callId !== input.callId) {
    return nothing;
  }
  const output = input.result.output;
  const events: DecidedEvent[] = [
    { type: "agent.finished", state: stateId, agent: pending.agent, output },
  ];
  if (state.output !== undefined) {
    events.push({ type: "context.updated", key: state.output, value: output });
  }
  return { events, effects: [], outcome: { type: "finish", event: "done" } };
}
