// A run's model turn stops at a call that needs a person's OK, and goes on
// from there once they answer (HAL-3331). Where it stopped is plain JSON
// (`AgentResume`) the run log keeps, so a run goes on after a restart. It
// holds the conversation and the calls still to handle, never a key.

import type { AgentResume, LoggedToolCall, ToolOutcome } from "@halonicjs/events";
import type { ChatMessage, ToolCall } from "@halonicjs/ports";
import { passResultToModel } from "./pass-result-to-model.ts";
import {
  carryOutCall,
  refuseCall,
  refuseUnoffered,
  runCalls,
  type ToolCallContext,
} from "./run-tool-call.ts";
import type { TurnTools } from "./turn-tools.ts";

/** The turn stopped at a tool call that needs a person's OK. */
export interface TurnStop {
  readonly type: "approval";
  /** The tool the waiting call goes to, as the model named it. */
  readonly tool: string;
  readonly args: Record<string, unknown>;
  /** Where the turn stopped; the waiting call is `resume.calls[0]`. */
  readonly resume: AgentResume;
}

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
  const turn = [await answerWaitingCall(context, tools, waiting, answer)];
  const step = await runCalls(context, tools, rest, turn);
  if (step.kind === "ask") {
    return stopAt(step.waiting, [...history, ...turn], resume.step);
  }
  return { kind: "ask-model", history, turn, round: resume.step + 1 };
}

/**
 * The stop before `waiting[0]`, which needs a person's OK.
 *
 * @param messages - the whole conversation so far, with the answer that made the calls
 * @param step - the round of the answer that made the calls
 */
export function stopAt(
  waiting: readonly ToolCall[],
  messages: readonly ChatMessage[],
  step: number,
): TurnStopped {
  const calls = waiting.map(loggedCall);
  const [call] = calls;
  if (call === undefined) {
    throw new Error("A turn can only stop at a call.");
  }
  const resume: AgentResume = { messages: [...messages], calls, step };
  return {
    kind: "stopped",
    stop: { type: "approval", tool: call.name, args: call.arguments, resume },
  };
}

async function answerWaitingCall(
  context: ToolCallContext,
  tools: TurnTools,
  call: ToolCall,
  answer: TurnAnswer,
): Promise<ChatMessage> {
  const tool = tools.byName.get(call.name);
  if (tool === undefined) {
    return refuseUnoffered(context, call);
  }
  if ("result" in answer) {
    return {
      role: "tool",
      toolCallId: call.id,
      name: call.name,
      content: passResultToModel(tool, answer.result),
    };
  }
  if (!answer.approved) {
    return refuseCall(context, tool.source, call, rejection(answer.comment));
  }
  return carryOutCall(context, tool, call);
}

/** Why the model's call didn't run: a person rejected it, and what they wrote, if anything. */
function rejection(comment: string | undefined): string {
  return comment === undefined || comment === ""
    ? "a person rejected the call"
    : `a person rejected the call and wrote: ${comment}`;
}

/** A copy of a call with only what the log keeps, so the stop holds plain data. */
function loggedCall(call: ToolCall): LoggedToolCall {
  return { id: call.id, name: call.name, arguments: call.arguments };
}
