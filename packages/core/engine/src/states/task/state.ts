import type { Agent } from "@halonicjs/format";
import { promptFor, withGets } from "@halonicjs/workflow";
import type {
  DecidedEvent,
  DecideInput,
  Effect,
  EffectDoneInput,
  ProgramHarness,
  ToolResult,
} from "../../kernel/decide-types.ts";
import {
  nothing,
  type StateContext,
  type StateHandler,
  type StateStep,
} from "../../kernel/registry.ts";
import { nextCallId } from "../../kernel/run-state.ts";

/**
 * A plain `task` state runs its agent once on entry: it asks for one model
 * call with the state's prompt, or, when the agent's file names a harness
 * other than Halonic's own loop, for one harness run. It finishes with
 * `done` when the answer comes back. Tool calls, methods, conversations,
 * artifacts and signals join with the agent loop (step 4).
 */
export const taskState: StateHandler<"task"> = {
  type: "task",
  enter: startAgent,
  onInput: finishAgent,
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
 * Only the answer to the call the state waits on counts. Any other result,
 * such as one delivered twice after a retry, changes nothing.
 */
function finishAgent({ run, stateId, state }: StateContext, input: DecideInput): StateStep {
  const pending = run.pendingCall;
  if (input.type !== "effect-done" || !isAgentAnswer(input.result)) {
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

/** A model call and a harness run both answer for the state's agent. */
function isAgentAnswer(
  result: EffectDoneInput["result"],
): result is Exclude<EffectDoneInput["result"], ToolResult> {
  return result.type === "model" || result.type === "harness";
}
