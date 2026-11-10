import type { Agent } from "@halonicjs/format";
import { promptFor, withGets } from "@halonicjs/workflow";
import { agentCallEffect } from "../../kernel/agent-call.ts";
import type { DecidedEvent, DecideInput } from "../../kernel/decide-types.ts";
import {
  nothing,
  type StateContext,
  type StateHandler,
  type StateStep,
} from "../../kernel/registry.ts";
import { nextCallId, type PendingCall } from "../../kernel/run-state.ts";
import { answerApproval, askForApproval, askForHarnessApproval } from "./approval.ts";
import {
  answersUnknownEffect,
  answerUnknownEffect,
  requestEffect,
  takeToolResult,
} from "./effect.ts";

/**
 * A plain `task` state runs its agent once on entry: it asks for one model
 * call with the state's prompt, or, when the agent's file names a harness
 * other than Halonic's own loop, for one harness run. It finishes with
 * `done` when the answer comes back. When the agent's output is a `choice`,
 * an answer that isn't one of its options fails the run with
 * `answer-not-an-option`. When the agent stops at a tool call that needs a
 * person's OK, the state waits for `approve` or `reject`, then the agent goes
 * on with the answer: in a new model call, or in the harness call that
 * asked, which kept running while the run waited. When it stops before a
 * connector call that can change things, the engine records the call and
 * makes it, and the agent goes on with the result; see `effect.ts`. Methods,
 * conversations, artifacts and signals join with the agent loop (step 4).
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
  return {
    events: [{ type: "agent.started", state: stateId, agent, prompt }],
    effects: [agentCallEffect(agents, call)],
  };
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
  let output = answer;
  const options = choiceOptionsOf(agents, pending.agent);
  if (options !== null) {
    const option = optionOf(options, output);
    if (option === null) {
      const error = notAnOptionError(pending.agent, options, output);
      return { ...nothing, outcome: { type: "fail", error, reason: "answer-not-an-option" } };
    }
    output = option;
  }
  const events: DecidedEvent[] = [
    { type: "agent.finished", state: stateId, agent: pending.agent, output },
  ];
  if (state.output !== undefined) {
    events.push({ type: "context.updated", key: state.output, value: output });
  }
  return { events, effects: [], outcome: { type: "finish", event: "done" } };
}

/** The options of an agent whose output is a `choice`, or `null` for any other agent. */
function choiceOptionsOf(
  agents: Readonly<Record<string, Agent>>,
  agentId: string,
): readonly string[] | null {
  const output = Object.hasOwn(agents, agentId) ? agents[agentId]?.output : undefined;
  return output?.type === "choice" ? output.options : null;
}

/**
 * The option the answer is, with the whitespace around it trimmed, or `null`
 * when it is none of them. The match is exact and case-sensitive, and the
 * engine never guesses the closest option.
 */
function optionOf(options: readonly string[], answer: unknown): string | null {
  if (typeof answer !== "string") return null;
  const trimmed = answer.trim();
  return options.find((option) => option === trimmed) ?? null;
}

/** The longest part of an answer `run.failed` quotes, in characters. */
const maxQuotedAnswer = 120;

function notAnOptionError(agentId: string, options: readonly string[], answer: unknown): string {
  const text = typeof answer === "string" ? answer : (JSON.stringify(answer) ?? String(answer));
  const quoted = text.length > maxQuotedAnswer ? `${text.slice(0, maxQuotedAnswer)}…` : text;
  const listed = options.map((option) => JSON.stringify(option)).join(", ");
  return (
    `Agent "${agentId}" answered ${JSON.stringify(quoted)}, which isn't one of its options: ${listed}. ` +
    "Tighten the agent's instructions or use a larger model."
  );
}
