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
  Secrets,
  ToolCall,
  ToolDefinition,
} from "@halonicjs/ports";
import { callCost } from "./call-cost.ts";
import { ModelChain, type ResolvedModel } from "./model-chain.ts";
import { runToolCall, type ToolCallContext } from "./run-tool-call.ts";
import { isToolCallAsText } from "./tool-call-as-text.ts";
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
}

/** How a model turn ended. */
export interface ModelTurnResult extends ChatResponse {
  /** Every assistant and tool message the turn added, ending with the last answer. */
  readonly turn: ChatMessage[];
  readonly refusals: ChatTurnRefusal[];
  /** The models skipped before any call, in order. */
  readonly skipped: ChatTurnSkip[];
  /** The model name that gave the last answer. */
  readonly model: string;
}

/**
 * Runs one model turn. It ends when the model answers without a call the
 * turn runs itself; with `finishReason: "tool_calls"` and only the caller's
 * calls when the model called caller tools (after the turn ran its own
 * calls from the same answer); or with `finishReason: "length"` and no
 * calls at the round limit, refusing the calls it dropped.
 *
 * A model without its key is skipped, and an offline one hands the call to
 * the next model at once; see {@link ModelChain}.
 *
 * @throws {ModelCallError} when no model is left, or with the reason the model gave for any other failure
 * @throws when the log can't be written
 */
export async function runModelTurn(input: ModelTurnInput): Promise<ModelTurnResult> {
  const tools = await collectTurnTools(input);
  const turn: ChatMessage[] = [];
  const models = new ModelChain(input.model, input.secrets, input.agent, input.log);
  const context: ToolCallContext = {
    agent: input.agent,
    refusals: [...tools.refusals],
    ...(input.log === undefined ? {} : { log: input.log }),
  };
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };
  for (let round = 1; ; round++) {
    const { response, answeredBy } = await askModel(input, models, tools, [
      ...input.messages,
      ...turn,
    ]);
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
      return ended;
    }
    if (round >= input.maxRounds) {
      return endAtRoundLimit(ended, tools, input.maxRounds);
    }
    turn.push(assistantMessage(response, response.toolCalls));
    const callerCalls: ToolCall[] = [];
    for (const call of response.toolCalls) {
      const tool = tools.byName.get(call.name);
      if (tool?.kind === "caller") {
        callerCalls.push(call);
        continue;
      }
      turn.push(await runToolCall(context, tool, call));
    }
    if (callerCalls.length > 0) {
      return { ...ended, toolCalls: callerCalls, finishReason: "tool_calls" };
    }
  }
}

async function askModel(
  input: ModelTurnInput,
  models: ModelChain,
  tools: TurnTools,
  messages: ChatMessage[],
) {
  const { agent } = input;
  const asked = await models.current();
  await input.log?.append({
    type: "llm.request",
    agent,
    provider: asked.provider.id,
    model: asked.model,
    messages: messages.length,
  });
  const started = input.clock.now().getTime();
  const answer = await models.chat({
    messages,
    tools: tools.tools.map((tool) => tool.definition),
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
  return { ...answer, toolCalls: [], finishReason: "length" as const };
}

function assistantMessage(response: ChatResponse, toolCalls: ToolCall[]): ChatMessage {
  return {
    role: "assistant",
    content: response.content,
    ...(toolCalls.length === 0 ? {} : { toolCalls }),
    ...(response.replay === undefined ? {} : { replay: response.replay }),
  };
}
