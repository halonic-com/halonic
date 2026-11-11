// A run's model turn stops at a call that needs a person's OK, and goes on
// from there once they answer (HAL-3331). Where it stopped is plain JSON
// (`AgentResume`) the run log keeps, so a run goes on after a restart. It
// holds the conversation and the calls still to handle, never a key.

import type { AgentResume, LoggedToolCall, ToolOutcome } from "@halonicjs/events";
import type { ChatMessage, ToolCall } from "@halonicjs/ports";
import { passResultToModel } from "./pass-result-to-model.ts";
import {
  type CallStep,
  makeOrHandOver,
  refuseCall,
  refuseUnoffered,
  runCalls,
  type StopKind,
  stopKindOf,
  type ToolCallContext,
} from "./run-tool-call.ts";
import type { SubagentStopped, TurnTools } from "./turn-tools.ts";

/**
 * The turn stopped before a tool call: one that needs a person's OK, or a
 * connector call that can change things, which the engine makes itself.
 */
export type TurnStop = StopAt & {
  /** The tool the waiting call goes to, as the model named it. */
  readonly tool: string;
  readonly args: Record<string, unknown>;
  /** Where the turn stopped; the waiting call is `resume.calls[0]`. */
  readonly resume: AgentResume;
};

/**
 * Why the turn stopped: `effect` names the connector the call goes to. At a
 * `delegate_*` call whose subagent stopped, it is why the subagent stopped.
 */
type StopAt =
  | { readonly type: "approval" }
  | { readonly type: "effect"; readonly connector: string };

/** Where a stopped turn goes on from, and what the person answered. */
export interface ApprovalAnswer {
  readonly resume: AgentResume;
  readonly approved: boolean;
  /** What the person wrote with the answer, if anything. */
  readonly comment?: string;
}

/**
 * Where a turn stopped before a connector call that can change things, and
 * the call's result once the engine made it. Its outcome is `unknown` when
 * the call broke off and a person chose to go on without it.
 */
export interface EffectAnswer {
  readonly resume: AgentResume;
  readonly result: string;
  readonly outcome: ToolOutcome;
}

/** What a stopped turn goes on with: a person's answer, or the result of the call it stopped at. */
export type TurnAnswer = ApprovalAnswer | EffectAnswer;

/** The turn stopped, and why. */
export interface TurnStopped {
  readonly kind: "stopped";
  readonly stop: TurnStop;
}

/** Where a turn asks its model next, or the stop it came to before that. */
export type TurnStart =
  | {
      readonly kind: "ask-model";
      /** The conversation before the turn's own messages. */
      readonly history: readonly ChatMessage[];
      /** The messages the turn added so far. */
      readonly turn: ChatMessage[];
      /** The round of the next model call. */
      readonly round: number;
    }
  | TurnStopped;

/**
 * Goes on from where a turn stopped: the waiting call runs when the person
 * approved it, and the model gets the refusal as its result when they
 * didn't. After a connector call the engine made, the model gets its
 * result. The other calls of that answer are then checked and run in
 * order, so the turn can stop again at the next one that needs an OK.
 *
 * @throws when `resume` names no waiting call
 */
export async function goOnAfterApproval(
  context: ToolCallContext,
  tools: TurnTools,
  answer: TurnAnswer,
): Promise<TurnStart> {
  const { resume } = answer;
  // The engine wrote these messages from ChatMessage values when the turn stopped.
  const history = resume.messages as ChatMessage[];
  const [waiting, ...rest] = resume.calls;
  if (waiting === undefined) {
    throw new Error("The agent can't go on after the approval: where it stopped names no call.");
  }
  if (resume.inner !== undefined) {
    // Going on inside the subagent comes next (HAL-3361); until then no run stops there.
    throw new Error(
      `The agent can't go on yet: it stopped inside its subagent "${resume.inner.agent}".`,
    );
  }
  const answered = await answerWaitingCall(context, tools, waiting, answer);
  if (answered.kind !== "answered") {
    return stopAt(resume.calls, history, resume.step, stopKindOf(answered));
  }
  const turn = [answered.message];
  const step = await runCalls(context, tools, rest, turn);
  if (step.kind === "stop") {
    return stopAt(step.waiting, [...history, ...turn], resume.step, step.at);
  }
  return { kind: "ask-model", history, turn, round: resume.step + 1 };
}

/**
 * The stop before `waiting[0]`, which needs a person's OK or the engine, or
 * delegates to a subagent that stopped ({@link stopAtDelegate}).
 *
 * @param messages - the whole conversation so far, with the answer that made the calls
 * @param step - the round of the answer that made the calls
 */
export function stopAt(
  waiting: readonly ToolCall[],
  messages: readonly ChatMessage[],
  step: number,
  at: StopKind,
): TurnStopped {
  if (at.type === "subagent") {
    return stopAtDelegate(waiting, messages, step, at.inner);
  }
  const [call, ...calls] = loggedCalls(waiting);
  const resume: AgentResume = { messages: [...messages], calls: [call, ...calls], step };
  return { kind: "stopped", stop: { ...at, tool: call.name, args: call.arguments, resume } };
}

/**
 * The stop at a `delegate_*` call, `waiting[0]`, whose subagent stopped. It
 * says what the subagent stopped for, with the subagent's tool and
 * arguments, so the engine and the person see one ordinary stop; `resume`
 * keeps where the subagent goes on from in `inner`.
 *
 * @param messages - the whole conversation so far, with the answer that made the calls
 * @param step - the round of the answer that made the calls
 */
export function stopAtDelegate(
  waiting: readonly ToolCall[],
  messages: readonly ChatMessage[],
  step: number,
  { agent, stop }: SubagentStopped,
): TurnStopped {
  const { resume: subagentResume, ...why } = stop;
  const resume: AgentResume = {
    messages: [...messages],
    calls: loggedCalls(waiting),
    step,
    inner: { agent, resume: subagentResume },
  };
  return { kind: "stopped", stop: { ...why, resume } };
}

/**
 * The answer to the call the turn stopped before. A call a person approved
 * is made, or handed over to the engine when it changes things.
 */
async function answerWaitingCall(
  context: ToolCallContext,
  tools: TurnTools,
  call: ToolCall,
  answer: TurnAnswer,
): Promise<CallStep> {
  const tool = tools.byName.get(call.name);
  if (tool === undefined) {
    return answered(await refuseUnoffered(context, call));
  }
  if ("result" in answer) {
    const content = passResultToModel(tool, answer.result);
    return answered({ role: "tool", toolCallId: call.id, name: call.name, content });
  }
  if (!answer.approved) {
    return answered(refuseCall(context, tool.source, call, rejection(answer.comment)));
  }
  return makeOrHandOver(context, tool, call);
}

function answered(message: ChatMessage): CallStep {
  return { kind: "answered", message };
}

/** Why the model's call didn't run: a person rejected it, and what they wrote, if anything. */
function rejection(comment: string | undefined): string {
  return comment === undefined || comment === ""
    ? "a person rejected the call"
    : `a person rejected the call and wrote: ${comment}`;
}

/**
 * Copies of the calls with only what the log keeps, so the stop holds plain data.
 *
 * @throws when there is no call, because a turn only stops at one
 */
function loggedCalls(waiting: readonly ToolCall[]): [LoggedToolCall, ...LoggedToolCall[]] {
  const [first, ...rest] = waiting.map(({ id, name, arguments: args }) => ({
    id,
    name,
    arguments: args,
  }));
  if (first === undefined) {
    throw new Error("A turn can only stop at a call.");
  }
  return [first, ...rest];
}
