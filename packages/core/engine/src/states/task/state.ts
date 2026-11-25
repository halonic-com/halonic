import { methodPrompt, stepPrompt, withGets } from "@halonicjs/workflow";
import { answerAgainPrompt, type CheckedAnswer, checkAnswer } from "../../kernel/agent-answer.ts";
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
import { stepOutputOf } from "../../kernel/step-output.ts";
import { signalSent } from "../../kernel/step-signal.ts";
import { answerApproval, askForApproval, askForHarnessApproval } from "./approval.ts";
import { artifactOf } from "./artifact.ts";
import { conversationTurns } from "./conversation.ts";
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
 * and text that isn't JSON fails the run, unless the agent's `answerRetries`
 * allows asking it again (`askAgain`), or the state has an `unusable`
 * transition to take instead (`routeUnusable`). When the agent stops at a tool call that needs a
 * person's OK, the state waits for `approve` or `reject`, then the agent goes
 * on with the answer: in a new model call, or in the harness call that
 * asked, which kept running while the run waited. When it stops before a
 * connector call that can change things, the engine records the call and
 * makes it, and the agent goes on with the result; see `effect.ts`. A state
 * with `artifact` saves the answer as a file; see `artifact.ts`. A state
 * with `signal` then sends it (`kernel/step-signal.ts`), and one with
 * `conversation` adds the prompt and the answer to the turns it keeps in the
 * context under that key (`conversation.ts`). A state with `method` sends
 * the method's prompt with its `with` values, and its answer is checked
 * against the method's `output`; the executor uses the method's model, steps
 * and tools.
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

function startAgent(context: StateContext<"task">): StateStep {
  const { run, stateId, state, agents } = context;
  const agent = state.agent;
  if (agent === undefined) {
    return {
      ...nothing,
      outcome: {
        type: "fail",
        error: `Task state "${stateId}" names no agent.`,
        // The workflow file's own mistake, so a host can say so (HAL-14301).
        cause: {
          kind: "invalid_input",
          code: "workflow.task-without-agent",
          detail: { state: stateId },
        },
      },
    };
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
  { run, stateId, state, scope, agents }: StateContext<"task">,
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
function takeCallResult(context: StateContext<"task">, input: DecideInput): StateStep {
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
    case "rule":
      // Only a `rule` state asks for a rule; its result means nothing here.
      return nothing;
  }
}

function finishAgent(
  context: StateContext<"task">,
  pending: PendingCall,
  answer: unknown,
): StateStep {
  const { stateId, state, agents, scope } = context;
  const stepOutput = stepOutputOf(agents, pending.agent, state);
  const retries = answerRetriesOf(agents, pending.agent);
  const retriesLeft = retries - (pending.answerRetry?.attempt ?? 0);
  const routed = takesUnusable(state);
  const checked = checkAnswer(agents, pending.agent, answer, stepOutput, retries > 0 || routed);
  if ("error" in checked) {
    if (retriesLeft > 0) {
      return askAgain(context, pending, checked);
    }
    return routed
      ? routeUnusable(context, pending, checked)
      : { ...nothing, outcome: { type: "fail", ...checked } };
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
  events.push(...signalSent(stateId, state, scope, events));
  const prompt = pending.answerRetry?.prompt ?? pending.prompt;
  events.push(...conversationTurns(state, scope, prompt, output));
  return { events, effects: [], outcome: { type: "finish", event: "done" } };
}

/** How often the agent's file lets a step ask it again after an unusable answer; 0 when it doesn't say. */
function answerRetriesOf(agents: StateContext<"task">["agents"], agent: string): number {
  return Object.hasOwn(agents, agent) ? (agents[agent]?.answerRetries ?? 0) : 0;
}

/** The event a task state ends with when its agent's last answer can't be used. */
const UNUSABLE_EVENT = "unusable";

/** Whether the state has a transition for an unusable answer; without one, such an answer fails the run. */
function takesUnusable(state: StateContext<"task">["state"]): boolean {
  return state.on.some((transition) => transition.event === UNUSABLE_EVENT);
}

/**
 * Ends the step with `unusable` instead of failing the run, once no retry is
 * left. `agent.finished` records the rejection, with the error, reason and
 * cause `run.failed` would have given, and no output.
 */
function routeUnusable(
  { stateId }: StateContext<"task">,
  pending: PendingCall,
  unusable: Extract<CheckedAnswer, { error: string }>,
): StateStep {
  const { error, reason, cause } = unusable;
  const finished: DecidedEvent = {
    type: "agent.finished",
    state: stateId,
    agent: pending.agent,
    output: null,
    error,
    reason,
    ...(cause === undefined ? {} : { cause }),
  };
  return { events: [finished], effects: [], outcome: { type: "finish", event: UNUSABLE_EVENT } };
}

/**
 * Asks the agent again, in the same step, after an answer its output can't
 * use: a new model or harness call whose prompt is the step's own prompt with
 * the error after it. `agent.answer-retried` records why, with the answer in
 * full, so a host can count the retries and read what was wrong.
 */
function askAgain(
  { run, stateId, agents }: StateContext<"task">,
  pending: PendingCall,
  unusable: Extract<CheckedAnswer, { error: string }>,
): StateStep {
  const ownPrompt = pending.answerRetry?.prompt ?? pending.prompt;
  const { error, reason, cause, rejected } = unusable;
  const prompt = answerAgainPrompt(ownPrompt, error, rejected?.parseError);
  const attempt = (pending.answerRetry?.attempt ?? 0) + 1;
  const call = { callId: nextCallId(run), state: stateId, agent: pending.agent, prompt };
  return {
    events: [
      {
        type: "agent.answer-retried",
        state: stateId,
        agent: pending.agent,
        reason,
        ...(cause === undefined ? {} : { cause }),
        error,
        attempt,
        prompt,
        ...(rejected === undefined ? {} : { rejected }),
      },
    ],
    effects: [agentCallEffect(run, agents, call)],
  };
}
