import type {
  ChatMessage,
  ChatTurnRequest,
  ChatTurnResponse,
  RunExecutor,
  ToolCall,
  ToolDefinition,
} from "@halonicjs/ports";

/** The turn limit of a chat when nothing sets one. */
export const defaultTurnLimit = 16;
/** The lowest turn limit a chat may have. */
export const minTurnLimit = 1;
/** The highest turn limit a chat may have. */
export const maxTurnLimit = 64;

/**
 * A tool a chat offers the model, with the code that runs it. The caller
 * builds the list: the Assistant's authoring tools, an agent's tools, and
 * later the connector tools that pass the outside-a-run gate.
 */
export interface ChatTool {
  definition: ToolDefinition;
  /**
   * Runs one call and returns the text the model reads as the result. A
   * refusal is a result too. Throwing gives the model "Error: <message>".
   */
  call(toolCall: ToolCall): Promise<string>;
}

/** The model settings of one answer: everything of a `ChatTurnRequest` but the messages and tools. */
export type ChatSettings = Omit<ChatTurnRequest, "messages" | "tools">;

/** One answer to the person's latest message. */
export interface ChatAnswerRequest {
  settings: ChatSettings;
  /** The conversation so far, with the person's new message last. It is not changed. */
  messages: readonly ChatMessage[];
  tools: readonly ChatTool[];
  /** The most model turns this answer makes, from 1 to 64; {@link defaultTurnLimit} when absent. */
  turnLimit?: number;
}

/**
 * How an answer ended:
 * - `answered`: the model answered without calling a tool
 * - `turn-limit`: the model still called tools after `turns` model turns
 */
export type ChatAnswerEnd = { reason: "answered" } | { reason: "turn-limit"; turns: number };

/** The result of {@link ChatService.answer}. */
export interface ChatAnswer {
  /** The messages the answer added, in order: assistant turns and tool results. */
  messages: ChatMessage[];
  end: ChatAnswerEnd;
}

/**
 * Chat outside any run: the agent chat, the Build assistant and inbox
 * conversations. It runs the turn loop on the `RunExecutor.chatTurn` port,
 * so in served mode each model turn goes to the host, which has the provider
 * keys, while the tools still run here. It keeps no conversations: the
 * caller stores them.
 */
export class ChatService {
  private readonly executor: Pick<RunExecutor, "chatTurn">;

  constructor(executor: Pick<RunExecutor, "chatTurn">) {
    this.executor = executor;
  }

  /**
   * Answers the person's latest message: asks the model, runs the tools it
   * calls, gives it their results and asks again, until it answers without
   * a tool call or reaches the turn limit.
   *
   * @throws RangeError when the turn limit isn't a whole number from 1 to 64
   * @throws when the model can't be reached or refuses the call
   */
  async answer(request: ChatAnswerRequest): Promise<ChatAnswer> {
    const turnLimit = checkedTurnLimit(request.turnLimit);
    const tools = new Map(request.tools.map((tool) => [tool.definition.name, tool]));
    const definitions = request.tools.map((tool) => tool.definition);
    const added: ChatMessage[] = [];

    for (let turn = 1; turn <= turnLimit; turn += 1) {
      const response = await this.executor.chatTurn({
        ...request.settings,
        messages: [...request.messages, ...added],
        tools: definitions,
      });
      added.push(assistantMessage(response));
      if (response.toolCalls.length === 0) {
        return { messages: added, end: { reason: "answered" } };
      }
      for (const toolCall of response.toolCalls) {
        added.push(await runTool(tools, toolCall));
      }
    }
    return { messages: added, end: { reason: "turn-limit", turns: turnLimit } };
  }
}

function checkedTurnLimit(turnLimit: number = defaultTurnLimit): number {
  if (!Number.isInteger(turnLimit) || turnLimit < minTurnLimit || turnLimit > maxTurnLimit) {
    throw new RangeError(
      `The turn limit must be a whole number from ${minTurnLimit} to ${maxTurnLimit}, not ${turnLimit}.`,
    );
  }
  return turnLimit;
}

/** The assistant message for a model turn, keeping the provider's `replay` unchanged. */
function assistantMessage(response: ChatTurnResponse): ChatMessage {
  const message: Extract<ChatMessage, { role: "assistant" }> = {
    role: "assistant",
    content: response.content,
  };
  if (response.toolCalls.length > 0) {
    message.toolCalls = response.toolCalls;
  }
  if (response.replay !== undefined) {
    message.replay = response.replay;
  }
  return message;
}

/**
 * Runs one tool call and returns its result message. A failure becomes the
 * result, so the model can react to it and every tool call in the history
 * keeps a result, which providers require.
 */
async function runTool(tools: Map<string, ChatTool>, toolCall: ToolCall): Promise<ChatMessage> {
  const result = (content: string): ChatMessage => ({
    role: "tool",
    content,
    toolCallId: toolCall.id,
    name: toolCall.name,
  });
  const tool = tools.get(toolCall.name);
  if (tool === undefined) {
    return result(`Error: there is no tool named "${toolCall.name}".`);
  }
  try {
    return result(await tool.call(toolCall));
  } catch (error) {
    return result(`Error: ${asError(error).message}`);
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
