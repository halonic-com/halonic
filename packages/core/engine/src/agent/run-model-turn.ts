// The agent loop of one turn: offer the tools, ask the model, run the calls
// the turn can run itself, and ask again until the model answers without
// them. Everything with side effects goes through ports, so tests run it
// on a scripted model with a fixed clock.

import type { Usage } from "@halonicjs/events";
import type {
  ChatMessage,
  ChatParams,
  ChatResponse,
  ChatTurnRefusal,
  Clock,
  ConnectorClient,
  LlmProvider,
  ToolCall,
  ToolDefinition,
} from "@halonicjs/ports";
import { runToolCall, type ToolCallContext } from "./run-tool-call.ts";
import type { TurnLog } from "./turn-log.ts";
import { collectTurnTools, type HalonicTool, halonicSource, type TurnTools } from "./turn-tools.ts";

/** What one model turn needs. */
export interface ModelTurnInput {
  readonly provider: LlmProvider;
  /** The model name at that provider. */
  readonly model: string;
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
}

/**
 * Runs one model turn. It ends when the model answers without a call the
 * turn runs itself; with `finishReason: "tool_calls"` and only the caller's
 * calls when the model called caller tools (after the turn ran its own
 * calls from the same answer); or with `finishReason: "length"` and no
 * calls at the round limit, refusing the calls it dropped.
 *
 * @throws when the model call fails or the log can't be written
 */
export async function runModelTurn(input: ModelTurnInput): Promise<ModelTurnResult> {
  const tools = await collectTurnTools(input);
  const turn: ChatMessage[] = [];
  const context: ToolCallContext = {
    agent: input.agent,
    refusals: [...tools.refusals],
    ...(input.log === undefined ? {} : { log: input.log }),
  };
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };
  for (let round = 1; ; round++) {
    const response = await askModel(input, tools, [...input.messages, ...turn]);
    usage = addUsage(usage, response.usage);
    const ended = { ...response, usage, turn, refusals: context.refusals };
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
  tools: TurnTools,
  messages: ChatMessage[],
): Promise<ChatResponse> {
  const { provider, model, agent } = input;
  await input.log?.append({
    type: "llm.request",
    agent,
    provider: provider.id,
    model,
    messages: messages.length,
  });
  const started = input.clock.now().getTime();
  const response = await provider.chat({
    model,
    messages,
    tools: tools.tools.map((tool) => tool.definition),
    ...(input.params === undefined ? {} : { params: input.params }),
    meta: { agentId: agent },
  });
  await input.log?.append({
    type: "llm.response",
    agent,
    provider: provider.id,
    model,
    usage: response.usage,
    latencyMs: input.clock.now().getTime() - started,
    text: response.content,
    ...(response.reasoning === undefined ? {} : { thoughts: response.reasoning }),
  });
  return response;
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

function addUsage(total: Usage, more: Usage): Usage {
  return {
    inputTokens: total.inputTokens + more.inputTokens,
    outputTokens: total.outputTokens + more.outputTokens,
  };
}
