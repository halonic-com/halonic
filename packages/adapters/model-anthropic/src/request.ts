import type { ChatMessage, ChatParams, ChatRequest, ToolCall } from "@halonicjs/ports";
import { deepClone, isPlainObject } from "@halonicjs/std";

/** The answer's length limit when the request sets none; the Messages API needs one on every call. */
export const defaultMaxTokens = 4096;

/** The `type` of the {@link ProviderReplay} this adapter writes and reads back. */
export const replayType = "anthropic";

/** One content block of a Messages API message. The API knows more kinds; we write these. */
type WireBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string }
  // A block from a replay, sent back exactly as the API wrote it.
  | Record<string, unknown>;

/** One message of a Messages API conversation. System prompts go in the body's `system` instead. */
interface WireMessage {
  role: "user" | "assistant";
  content: WireBlock[];
}

/** How a request is written for one call. */
export interface RequestOptions {
  /** Whether the API should answer as server-sent events. */
  stream: boolean;
}

/**
 * The JSON body of a `/v1/messages` call for `request`. It builds a new
 * object and leaves `request` as it was. `meta`, `signal` and
 * `responseFormat` are never sent: the Messages API has no plain JSON mode.
 */
export function toWireBody(request: ChatRequest, options: RequestOptions): Record<string, unknown> {
  const system = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const body: Record<string, unknown> = {
    // `extra` goes first, so it can add vendor settings (such as `thinking`) but never replace ours.
    ...request.params?.extra,
    model: request.model,
    max_tokens: request.params?.maxTokens ?? defaultMaxTokens,
    ...(system === "" ? {} : { system }),
    messages: toWireMessages(request.messages),
    ...wireParams(request.params ?? {}),
    stream: options.stream,
  };
  if (request.tools !== undefined && request.tools.length > 0) {
    body["tools"] = request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }
  return body;
}

/**
 * The conversation as Messages API messages. Tool results go in a user
 * message, as the API wants, and turns of the same role in a row become one
 * message, because the API wants user and assistant to take turns.
 */
function toWireMessages(messages: ChatMessage[]): WireMessage[] {
  const wire: WireMessage[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    const role = message.role === "assistant" ? "assistant" : "user";
    const content = toWireBlocks(message);
    if (content.length === 0) continue;
    const previous = wire.at(-1);
    if (previous?.role === role) previous.content.push(...content);
    else wire.push({ role, content });
  }
  for (const message of wire) {
    if (message.role === "user") message.content = toolResultsFirst(message.content);
  }
  return wire;
}

function toWireBlocks(message: Exclude<ChatMessage, { role: "system" }>): WireBlock[] {
  switch (message.role) {
    case "user":
      return textBlocks(message.content);
    case "tool":
      return [{ type: "tool_result", tool_use_id: message.toolCallId, content: message.content }];
    case "assistant":
      return replayedBlocks(message.replay) ?? assistantBlocks(message.content, message.toolCalls);
  }
}

/** The API turns down empty text blocks, so empty text sends none. */
function textBlocks(text: string): WireBlock[] {
  return text === "" ? [] : [{ type: "text", text }];
}

function assistantBlocks(content: string, toolCalls: ToolCall[] = []): WireBlock[] {
  const calls = toolCalls.map(
    (call): WireBlock => ({
      type: "tool_use",
      id: call.id,
      name: call.name,
      input: call.arguments,
    }),
  );
  return [...textBlocks(content), ...calls];
}

/**
 * The content blocks an Anthropic reply gave for this turn, when its replay
 * is ours. Thinking blocks must go back unchanged with their signatures, so
 * the replay wins over `content` and `toolCalls`. A copy, so the stored
 * replay can't change.
 */
function replayedBlocks(
  replay: { type: string; data: unknown } | undefined,
): WireBlock[] | undefined {
  if (replay?.type !== replayType || !Array.isArray(replay.data)) return undefined;
  const blocks = replay.data.filter(isPlainObject);
  if (blocks.length === 0) return undefined;
  return deepClone(blocks);
}

/** The API wants a user message's tool results before anything else in it. */
function toolResultsFirst(blocks: WireBlock[]): WireBlock[] {
  const isResult = (block: WireBlock): boolean => block["type"] === "tool_result";
  return [...blocks.filter(isResult), ...blocks.filter((block) => !isResult(block))];
}

/** The sampling settings that are set, under their wire names. `max_tokens` is written above. */
function wireParams(params: ChatParams): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    temperature: params.temperature,
    top_p: params.topP,
    stop_sequences: params.stop,
  };
  return Object.fromEntries(Object.entries(wire).filter(([, value]) => value !== undefined));
}
