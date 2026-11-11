// The agent loop of one turn: offer the tools, ask the model, run the calls
// the turn can run itself, and ask again until the model answers without
// them. Everything with side effects goes through ports, so tests run it
// on a scripted model with a fixed clock.

import { addUsage, type Usage } from "@halonicjs/events";
import type {
  ChatMessage,
  ChatParams,
  ChatResponse,
  ChatTurnRefusal,
  ChatTurnSkip,
  Clock,
  ConnectorClient,
  KnowledgeProvider,
  Secrets,
  ToolCall,
  ToolDefinition,
} from "@halonicjs/ports";
import { withKnowledgeFirst } from "../knowledge/knowledge-first.ts";
import { callCost } from "./call-cost.ts";
import type { CallChecker } from "./check-call-before-run.ts";
import { checkChatToolCall } from "./check-chat-tool-call.ts";
import { withFencedTextsNotice } from "./fenced-texts-notice.ts";
import { ModelChain, type ResolvedModel } from "./model-chain.ts";
import { type EffectBoundary, runCalls, type ToolCallContext } from "./run-tool-call.ts";
import { isToolCallAsText } from "./tool-call-as-text.ts";
import {
  goOnAfterApproval,
  stopAt,
  type TurnAnswer,
  type TurnStart,
  type TurnStopped,
} from "./turn-approval.ts";
import type { TurnLog } from "./turn-log.ts";
import { collectTurnTools, type HalonicTool, halonicSource, type TurnTools } from "./turn-tools.ts";

/** What one model turn needs. */
export interface ModelTurnInput {
  /** The model the turn starts on, with the models it falls back to. */
  readonly model: ResolvedModel;
  /** Where the turn checks that a model's key is set; it never reads further than that. */
  readonly secrets: Secrets;
  /** The conversation so far. */
  readonly messages: readonly ChatMessage[];
  /** The caller's tools: offered first, and handed back instead of run. */
  readonly callerTools: readonly ToolDefinition[];
  /** Halonic's own tools, offered after the caller's and run by the turn. */
  readonly halonicTools: readonly HalonicTool[];
  /** The connected servers, whose listed tools are offered last and run by the turn. */
  readonly connectors: readonly ConnectorClient[];
  readonly params?: ChatParams;
  /** The most model calls the turn makes, at least 1. */
  readonly maxRounds: number;
  /** The agent the model calls are for; it names the agent in the events. */
  readonly agent: string;
  /** Times the model calls, for `latencyMs`. */
  readonly clock: Clock;
  /** Where the events go; a turn outside any run has none. */
  readonly log?: TurnLog;
  /** Checks each call the turn runs itself; a chat turn's check ({@link checkChatToolCall}) when left out. */
  readonly checkCall?: CallChecker;
  /**
   * The agent's knowledge sources with `mode: auto`: before the first model
   * call, the task text is searched and their best passages go into the prompt.
   */
  readonly autoKnowledge?: readonly KnowledgeProvider[];
  /**
   * Whether the workspace is local only (`privacy.localOnly: true`): the
   * turn skips every model that isn't `local` before calling it.
   */
  readonly localOnly?: boolean;
}

/**
 * What a run's model turn needs: no caller tools, because a run hands no
 * call back to a caller, and the place to go on from after an approval.
 */
export interface AgentTurnInput extends Omit<ModelTurnInput, "callerTools"> {
  /** Where the turn stopped, and the person's answer or the call's result; absent for a new turn. */
  readonly resumeFrom?: TurnAnswer;
  /**
   * Where the turn hands over connector calls that can change things; see
   * {@link EffectBoundary}. Without it, the turn makes every call itself.
   */
  readonly effects?: EffectBoundary;
}

/** How a run's model turn ended: with an answer, or at a call that waits for a person's OK. */
export type AgentTurnOutcome =
  | { readonly kind: "answered"; readonly result: ModelTurnResult }
  | TurnStopped;

/** How a model turn ended. */
export interface ModelTurnResult extends ChatResponse {
  /** Every assistant and tool message the turn added, ending with the last answer. */
  readonly turn: ChatMessage[];
  readonly refusals: ChatTurnRefusal[];
  /** The models skipped before any call, in order. */
  readonly skipped: ChatTurnSkip[];
  /** The model name that gave the last answer. */
  readonly model: string;
  /** Set when the turn reached its round limit while the model still called tools. */
  readonly atRoundLimit?: true;
}

/**
 * Runs one model turn. It ends when the model answers without a call the
 * turn runs itself; with `finishReason: "tool_calls"` and only the caller's
 * calls when the model called caller tools (after the turn ran its own
 * calls from the same answer); or with `finishReason: "length"` and no
 * calls at the round limit, refusing the calls it dropped.
 *
 * A model without its key is skipped, and an offline or busy one hands the
 * call to the next model at once; see {@link ModelChain}.
 *
 * @throws {ModelCallError} when no model is left, or with the reason the model gave for any other failure
 * @throws when the log can't be written, or the turn stops for a person's OK or for the engine, which only a run can wait for
 */
export async function runModelTurn(input: ModelTurnInput): Promise<ModelTurnResult> {
  const outcome = await turnLoop(input);
  if (outcome.kind === "stopped") {
    const { type, tool } = outcome.stop;
    const waitsFor =
      type === "approval" ? `a person's OK on ${tool}` : `the engine to make ${tool}`;
    throw new Error(`The turn stopped for ${waitsFor}, which only a run can wait for.`);
  }
  return outcome.result;
}

/**
 * Runs a run's model turn as {@link runModelTurn} does, except that it
 * stops before a call the check asks a person about. Given `resumeFrom`,
 * it goes on from that stop with the person's answer.
 *
 * @throws as {@link runModelTurn} does, and when `resumeFrom` names no waiting call
 */
export function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnOutcome> {
  return turnLoop({ ...input, callerTools: [] }, input);
}

async function turnLoop(
  input: ModelTurnInput,
  { resumeFrom, effects }: Pick<AgentTurnInput, "resumeFrom" | "effects"> = {},
): Promise<AgentTurnOutcome> {
  const tools = await collectTurnTools(input);
  const models = new ModelChain(
    input.model,
    input.secrets,
    input.agent,
    input.log,
    input.localOnly === true,
  );
  const context: ToolCallContext = {
    agent: input.agent,
    refusals: [...tools.refusals],
    check: input.checkCall ?? checkChatToolCall,
    ...(input.log === undefined ? {} : { log: input.log }),
    ...(effects === undefined ? {} : { effects }),
  };
  // A resumed turn's history already holds the passages it started with.
  const start: TurnStart =
    resumeFrom === undefined
      ? { kind: "ask-model", history: await firstMessages(input), turn: [], round: 1 }
      : await goOnAfterApproval(context, tools, resumeFrom);
  if (start.kind === "stopped") {
    return start;
  }
  const { history, turn } = start;
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };
  for (let round = start.round; ; round++) {
    const { response, answeredBy } = await askModel(input, models, tools, [...history, ...turn]);
    usage = addUsage(usage, response.usage);
    const ended = {
      ...response,
      usage,
      turn,
      refusals: context.refusals,
      skipped: models.skipped,
      model: answeredBy.model,
    };
    if (response.toolCalls.length === 0) {
      turn.push(assistantMessage(response, response.toolCalls));
      return answered(ended);
    }
    if (round >= input.maxRounds) {
      return answered(endAtRoundLimit(ended, tools, input.maxRounds));
    }
    turn.push(assistantMessage(response, response.toolCalls));
    const step = await runCalls(context, tools, response.toolCalls, turn);
    if (step.kind === "stop") {
      return stopAt(step.waiting, [...history, ...turn], round, step.at);
    }
    if (step.callerCalls.length > 0) {
      return answered({ ...ended, toolCalls: step.callerCalls, finishReason: "tool_calls" });
    }
  }
}

/** The messages of a new turn, with the passages of the `auto` knowledge sources. */
async function firstMessages(input: ModelTurnInput): Promise<readonly ChatMessage[]> {
  const sources = input.autoKnowledge ?? [];
  if (sources.length === 0) {
    return input.messages;
  }
  return await withKnowledgeFirst({
    sources,
    messages: input.messages,
    agent: input.agent,
    ...(input.log === undefined ? {} : { log: input.log }),
  });
}

function answered(result: ModelTurnResult): AgentTurnOutcome {
  return { kind: "answered", result };
}

async function askModel(
  input: ModelTurnInput,
  models: ModelChain,
  tools: TurnTools,
  messages: ChatMessage[],
) {
  const { agent } = input;
  const definitions = tools.tools.map((tool) => tool.definition);
  const sent = withFencedTextsNotice(messages, definitions);
  const asked = await models.current();
  await input.log?.append({
    type: "llm.request",
    agent,
    provider: asked.provider.id,
    model: asked.model,
    messages: sent.length,
  });
  const started = input.clock.now().getTime();
  const answer = await models.chat({
    messages: sent,
    tools: definitions,
    ...(input.params === undefined ? {} : { params: input.params }),
    meta: { agentId: agent },
  });
  const { response, answeredBy } = answer;
  const cost = callCost(answeredBy, response.usage);
  await input.log?.append({
    type: "llm.response",
    agent,
    provider: answeredBy.provider.id,
    model: answeredBy.model,
    usage: response.usage,
    latencyMs: input.clock.now().getTime() - started,
    text: response.content,
    ...(response.reasoning === undefined ? {} : { thoughts: response.reasoning }),
    ...(cost === undefined ? {} : { cost }),
    ...(isToolCallAsText(response, tools.byName) ? { toolCallAsText: true as const } : {}),
  });
  return answer;
}

/**
 * The calls of the last answer never ran, so none goes back as a call the
 * caller should run. The answer keeps its text only: its `replay` would name
 * the dropped calls, and a later request would need a result for each.
 */
function endAtRoundLimit(ended: ModelTurnResult, tools: TurnTools, maxRounds: number) {
  for (const call of ended.toolCalls) {
    ended.refusals.push({
      source: tools.byName.get(call.name)?.source ?? halonicSource,
      name: call.name,
      refused: "call",
      reason: `the turn reached its limit of ${maxRounds} model calls before it could run`,
    });
  }
  ended.turn.push({ role: "assistant", content: ended.content });
  const { replay: _dropped, ...answer } = ended;
  return { ...answer, toolCalls: [], finishReason: "length" as const, atRoundLimit: true as const };
}

function assistantMessage(response: ChatResponse, toolCalls: ToolCall[]): ChatMessage {
  return {
    role: "assistant",
    content: response.content,
    ...(toolCalls.length === 0 ? {} : { toolCalls }),
    ...(response.replay === undefined ? {} : { replay: response.replay }),
  };
}
