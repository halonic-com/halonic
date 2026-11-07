import type { Usage } from "@halonicjs/events";

/** A tool call the model asked for. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Opaque data a provider needs back with this call in later turns (Gemini's thought signature). */
  signature?: string;
}

/** One message of a conversation with a model. */
export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
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
}
