import type { Usage } from "@halonicjs/events";

/** A tool call the model asked for. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Opaque data a provider needs back with this call in later turns (Gemini's thought signature). */
  signature?: string;
}

/**
 * A provider's own record of an assistant turn, which it needs back unchanged
 * in later turns (Anthropic's content blocks with their thinking signatures,
 * OpenAI's reasoning items).
 *
 * Only the provider that wrote it reads `data`. The engine copies `replay`
 * from a {@link ChatResponse} onto the assistant {@link ChatMessage} it
 * stores for that turn, never changes it, and keeps it as JSON. A provider
 * sends `data` back only when `type` is its own; otherwise, as after a model
 * switch, it builds the turn from `content` and `toolCalls`.
 *
 * @example
 * const replay: ProviderReplay = { type: "anthropic", data: body.content };
 */
export interface ProviderReplay {
  /** The provider that wrote it, such as "anthropic". */
  type: string;
  /** JSON-safe data only that provider understands. */
  data: unknown;
}

/** One message of a conversation with a model. */
export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[]; replay?: ProviderReplay }
  | { role: "tool"; content: string; toolCallId: string; name: string };

/** A tool the model may call. */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema of the arguments object. */
  parameters: Record<string, unknown>;
}

/** Sampling settings for one model call. Providers ignore what they don't support. */
export interface ChatParams {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stop?: string[];
  reasoningEffort?: "low" | "medium" | "high";
  extra?: Record<string, unknown>;
}

/** One model call. */
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  params?: ChatParams;
  responseFormat?: "text" | "json";
  /** Who is asking; used by mocks, logging and routing. Never sent to vendors. */
  meta?: { agentId?: string; runId?: string };
  signal?: AbortSignal;
}

/** The model's answer to one {@link ChatRequest}. */
export interface ChatResponse {
  content: string;
  /** The model's own summary of its reasoning, where the provider gives one (Gemini thought summaries). */
  reasoning?: string;
  toolCalls: ToolCall[];
  usage: Usage;
  finishReason: "stop" | "tool_calls" | "length" | "error" | "other";
  /** The provider's record of this turn; the engine copies it onto the assistant message unchanged. */
  replay?: ProviderReplay;
}

/**
 * One piece of a streamed answer. Deltas arrive in the order the model
 * writes them; the stream ends with exactly one `done`, whose `response` is
 * what `chat()` would have returned for the same request.
 *
 * A tool call arrives in pieces too: the first piece for an `index` carries
 * its `id` and `name`, and the `arguments` pieces join into the JSON text of
 * its arguments. Only `done` holds the parsed {@link ToolCall}.
 *
 * The pieces must add up to `done`: the `text` deltas joined equal
 * `done.response.content`, and the `arguments` pieces for each `index`
 * joined parse to `done.response.toolCalls[index].arguments`. A stream that
 * ends without `done`, or yields anything after it, is an error for the
 * caller. The engine runs tool calls only from `done`, never from deltas.
 *
 * @example
 * if (provider.capabilities.streaming && provider.stream) {
 *   for await (const event of provider.stream(request)) {
 *     if (event.type === "text") showText(event.delta);
 *     if (event.type === "done") return event.response;
 *   }
 * }
 */
export type ChatStreamEvent =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "tool-call"; index: number; id?: string; name?: string; arguments: string }
  | { type: "done"; response: ChatResponse };
