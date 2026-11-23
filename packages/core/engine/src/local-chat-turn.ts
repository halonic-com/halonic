// The local executor's chat turn, and Halonic's tools that chat turns and run turns share.

import type { Agent } from "@halonicjs/format";
import type { ChatTurnRequest, ChatTurnResponse } from "@halonicjs/ports";
import { chatToolCheckOf } from "./agent/check-chat-tool-call.ts";
import { agentParamsOf } from "./agent/model-params.ts";
import { runModelTurn } from "./agent/run-model-turn.ts";
import type { HalonicTool } from "./agent/turn-tools.ts";
import { type ChatHarnessTurns, harnessTurnOf } from "./harness/chat-harness-turns.ts";
import { type AgentKnowledge, noKnowledge, openSources } from "./knowledge/agent-knowledge.ts";
import type { LocalExecutorOptions } from "./local-executor-options.ts";
import { allowedToolsOf, connectorsOf } from "./run/connector-calls.ts";
import { AgentMemory } from "./tools/agent-memory/agent-memory.ts";
import { memoryTools } from "./tools/agent-memory/memory-tools.ts";
import { knowledgeTools } from "./tools/knowledge/knowledge-tools.ts";

/** The agent name a chat turn's model calls carry when the request names none. */
const chatAgent = "chat";

/** What a chat turn runs with: the executor's options, as it filtered them, and its harnesses. */
export interface LocalChatTurnContext {
  readonly options: LocalExecutorOptions;
  readonly maxRounds: number;
  readonly chatHarnesses: ChatHarnessTurns | undefined;
}

/**
 * Runs one chat turn with the caller's tools, Halonic's tools, the agent's
 * knowledge tools and the connected servers' tools: only those its file
 * lists when the turn names an agent with a file. It keeps no run log,
 * because a chat turn belongs to no run: the models it skipped are in
 * `skipped` instead.
 *
 * A turn whose agent's file names a harness program runs in that harness
 * instead, as one harness call ({@link ChatHarnessTurns.turn}). Only a
 * model turn passes its text to the request's `onText` as it is written; a
 * harness turn doesn't stream yet.
 *
 * @throws when no model fits the request
 * @throws {ModelCallError} when no model is left, or with the reason the model gave for any other failure
 * @throws when the agent runs in a harness and the executor has no `runs.harnesses`, or the harness call fails
 */
export async function localChatTurn(
  context: LocalChatTurnContext,
  request: ChatTurnRequest,
): Promise<ChatTurnResponse> {
  const { options } = context;
  const agent = await chatAgentFileOf(options, request);
  const harnessTurn = harnessTurnOf(request, agent);
  if (harnessTurn !== undefined) {
    if (context.chatHarnesses === undefined) {
      throw new Error(
        `Agent "${harnessTurn.agentId}" runs in ${harnessTurn.harness}, and this executor has no harnesses to run it in.`,
      );
    }
    return context.chatHarnesses.turn(harnessTurn);
  }
  const knowledge = await chatKnowledgeOf(options, request);
  const lists = await options.chatConnectorToolsOf?.(request);
  const connectors =
    agent === undefined ? options.connectors : connectorsOf(options.connectors, agent);
  return runModelTurn({
    model: await options.resolveModel(request),
    secrets: options.secrets,
    messages: request.messages,
    callerTools: request.tools,
    halonicTools: [
      ...halonicToolsOf(options, request.agentId),
      ...knowledgeTools(knowledge.sources),
    ],
    connectors: lists === undefined ? connectors : allowedToolsOf(connectors, lists),
    listedToolApproval: options.listedToolApproval,
    ...(lists === undefined ? {} : { checkCall: chatToolCheckOf(lists) }),
    ...agentParamsOf(agent, request.params),
    maxRounds: context.maxRounds,
    agent: request.agentId ?? chatAgent,
    clock: options.clock,
    autoKnowledge: knowledge.auto,
    localOnly: options.localOnly === true,
    ...(request.onText === undefined ? {} : { onText: request.onText }),
  });
}

/**
 * Halonic's tools for a turn: the agent's memory tools come last, when
 * there is an agent and a store. A chat turn adds the agent's knowledge
 * tools; a run's agent also gets those and what its file grants
 * (`LocalExecutor.runToolsOf`).
 *
 * @param runId - the run the turn is in, which the agent's notes name; absent in a chat
 */
export function halonicToolsOf(
  options: LocalExecutorOptions,
  agentId: string | undefined,
  runId?: string,
): readonly HalonicTool[] {
  const records = options.memory;
  if (agentId === undefined || records === undefined) {
    return options.halonicTools;
  }
  const memory = new AgentMemory({
    records,
    clock: options.clock,
    agentId,
    ...(runId === undefined ? {} : { runId }),
  });
  return [...options.halonicTools, ...memoryTools(memory)];
}

/**
 * The file of the agent a chat turn names, as the workspace has it now;
 * `undefined` when it names none, the agent has no file, or the executor
 * has no `chatAgentOf`.
 */
async function chatAgentFileOf(
  options: LocalExecutorOptions,
  request: ChatTurnRequest,
): Promise<Agent | undefined> {
  if (request.agentId === undefined || options.chatAgentOf === undefined) return undefined;
  return options.chatAgentOf(request);
}

/** The knowledge sources of a chat turn's agent, as the workspace has them now. */
async function chatKnowledgeOf(
  options: LocalExecutorOptions,
  request: ChatTurnRequest,
): Promise<AgentKnowledge> {
  const knowledge = options.knowledge;
  if (knowledge === undefined || request.agentId === undefined) {
    return noKnowledge;
  }
  return openSources(request.hubId, await knowledge.chatSourcesOf(request), knowledge);
}
