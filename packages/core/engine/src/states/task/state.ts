import type { Agent } from "@halonicjs/format";
import { promptFor, withGets } from "@halonicjs/workflow";
import type {
  DecidedEvent,
  DecideInput,
  Effect,
  ProgramHarness,
} from "../../kernel/decide-types.ts";
import {
  nothing,
  type StateContext,
  type StateHandler,
  type StateStep,
} from "../../kernel/registry.ts";
import { nextCallId, type PendingCall } from "../../kernel/run-state.ts";
import { answerApproval, askForApproval } from "./approval.ts";

/**
 * A plain `task` state runs its agent once on entry: it asks for one model
 * call with the state's prompt, or, when the agent's file names a harness
 * other than Halonic's own loop, for one harness run. It finishes with
 * `done` when the answer comes back. When the agent stops at a tool call
 * that needs a person's OK, the state waits for `approve` or `reject`, then
 * the agent goes on with the answer. Methods, conversations, artifacts and
 * signals join with the agent loop (step 4).
 */
export const taskState: StateHandler<"task"> = {
  type: "task",
  enter: startAgent,
  onInput: (context, input) => {
    if (input.type === "send") return answerApproval(context, input);
    return takeCallResult(context, input);
  },
};

function startAgent({ run, stateId, state, scope, agents }: StateContext): StateStep {
  const agent = state.agent;
  if (agent === undefined) {
    return {
      ...nothing,
      outcome: { type: "fail", error: `Task state "${stateId}" names no agent.` },
    };
  }
  const prompt = withGets(promptFor(state.input, scope, run.input), state.gets, scope);
  const call = { callId: nextCallId(run), state: stateId, agent, prompt };
  const harness = programHarnessOf(agents, agent);
  const effect: Effect =
    harness === null ? { type: "call-model", ...call } : { type: "run-harness", ...call, harness };
  return {
    events: [{ type: "agent.started", state: stateId, agent, prompt }],
    effects: [effect],
  };
}

/**
 * The harness that starts a program for the agent, or `null` when Halonic's
 * own loop runs it: when its file says so, names no harness, or isn't among
 * the run's definitions (runs kept before agents joined them).
 */
function programHarnessOf(
  agents: Readonly<Record<string, Agent>>,
  agentId: string,
): ProgramHarness | null {
  const harness = Object.hasOwn(agents, agentId) ? agents[agentId]?.harness : undefined;
  return harness === undefined || harness === "halonic" ? null : harness;
}

/**
 * Only the result of the call the state waits on counts. Any other result,
 * such as one delivered twice after a retry, changes nothing.
 */
function takeCallResult(context: StateContext, input: DecideInput): StateStep {
  const pending = context.run.pendingCall;
  if (input.type !== "effect-done") {
    return nothing;
  }
  if (pending === null || pending.state !== context.stateId || pending.callId !== input.callId) {
    return nothing;
  }
  switch (input.result.type) {
    case "model":
    case "harness":
      return finishAgent(context, pending, input.result.output);
    case "approval":
      return askForApproval(context, pending, input.result);
    case "tool":
      return nothing;
  }
}

function finishAgent(
  { stateId, state }: StateContext,
  pending: PendingCall,
  output: unknown,
): StateStep {
  const events: DecidedEvent[] = [
    { type: "agent.finished", state: stateId, agent: pending.agent, output },
  ];
  if (state.output !== undefined) {
    events.push({ type: "context.updated", key: state.output, value: output });
  }
  return { events, effects: [], outcome: { type: "finish", event: "done" } };
}
