import { methodPrompt, stepPrompt, withGets } from "@halonicjs/workflow";
import { checkAnswer } from "../../kernel/agent-answer.ts";
import { agentCallEffect } from "../../kernel/agent-call.ts";
import type { DecidedEvent, DecideInput } from "../../kernel/decide-types.ts";
import {
  nothing,
  type StateContext,
  type StateHandler,
  type StateStep,
} from "../../kernel/registry.ts";
import { nextCallId, type PendingCall } from "../../kernel/run-state.ts";
import { methodOf, noMethodError } from "../../kernel/step-method.ts";
import { answerApproval, askForApproval, askForHarnessApproval } from "./approval.ts";
import { artifactOf } from "./artifact.ts";
import {
  answersUnknownEffect,
  answerUnknownEffect,
  requestEffect,
  takeToolResult,
} from "./effect.ts";

/**
 * A plain `task` state runs its agent once on entry: it asks for one model
 * call with the state's prompt, or, when the run or the agent's file names a
 * harness other than Halonic's own loop, for one harness run. It finishes with
 * `done` when the answer comes back. When the agent's output is a `choice`,
 * an answer that isn't one of its options fails the run with
 * `answer-not-an-option`; when it is `json`, the answer is parsed into data,
 * and text that isn't JSON fails the run. When the agent stops at a tool call that needs a
 * person's OK, the state waits for `approve` or `reject`, then the agent goes
 * on with the answer: in a new model call, or in the harness call that
 * asked, which kept running while the run waited. When it stops before a
 * connector call that can change things, the engine records the call and
 * makes it, and the agent goes on with the result; see `effect.ts`. A state
 * with `artifact` saves the answer as a file; see `artifact.ts`. A state
 * with `method` sends the method's prompt with its `with` values, and its
 * answer is checked against the method's `output`; the executor uses the
 * method's model, steps and tools. Conversations and signals join with the
 * agent loop (step 4).
 */
export const taskState: StateHandler<"task"> = {
  type: "task",
  enter: startAgent,
  onInput: (context, input) => {
    if (input.type === "send") {
      return answersUnknownEffect(context, input)
        ? answerUnknownEffect(context, input)
        : answerApproval(context, input);
    }
    if (input.type === "harness-asked") return askForHarnessApproval(context, input);
    return takeCallResult(context, input);
  },
};

function startAgent(context: StateContext): StateStep {
  const { run, stateId, state, agents } = context;
  const agent = state.agent;
  if (agent === undefined) {
    return failWith(`Task state "${stateId}" names no agent.`);
  }
  const prompt = promptOf(context, agent);
  if (typeof prompt !== "string") {
    return failWith(prompt.error);
  }
  const call = { callId: nextCallId(run), state: stateId, agent, prompt };
  return {
    events: [{ type: "agent.started", state: stateId, agent, prompt }],
    effects: [agentCallEffect(run, agents, call)],
  };
}

/**
 * The state's prompt: its method's prompt with the picked data after it, or
 * its `input`, or the error when its agent has no such method.
 */
function promptOf(
  { run, stateId, state, scope, agents }: StateContext,
  agent: string,
): string | { readonly error: string } {
  if (state.method === undefined) {
    return stepPrompt(state.input, state.gets, scope, run.input);
  }
  const method = methodOf(agents, agent, state.method);
  if (method === undefined) {
    return { error: noMethodError(stateId, agent, state.method) };
  }
  return withGets(methodPrompt(state.method, method, state.with, scope), state.gets, scope);
}

function failWith(error: string): StateStep {
  return { ...nothing, outcome: { type: "fail", error } };
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
  if (input.result.type === "tool") {
    return takeToolResult(context, input, input.result);
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
    case "effect":
      return requestEffect(context, pending, input.result);
  }
}

function finishAgent(
  { stateId, state, agents }: StateContext,
  pending: PendingCall,
  answer: unknown,
): StateStep {
  const method =
    state.method === undefined ? undefined : methodOf(agents, pending.agent, state.method);
  const checked = checkAnswer(agents, pending.agent, answer, method);
  if ("error" in checked) {
    return { ...nothing, outcome: { type: "fail", ...checked } };
  }
  const output = checked.output;
  const events: DecidedEvent[] = [
    { type: "agent.finished", state: stateId, agent: pending.agent, output },
  ];
  if (state.output !== undefined) {
    events.push({ type: "context.updated", key: state.output, value: output });
  }
  const artifact = artifactOf(stateId, state, output);
  if (artifact?.type === "fail") {
    return { events, effects: [], outcome: artifact };
  }
  if (artifact !== null) {
    events.push(artifact);
  }
  return { events, effects: [], outcome: { type: "finish", event: "done" } };
}
