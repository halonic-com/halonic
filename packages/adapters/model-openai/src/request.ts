import type {
  ChatMessage,
  ChatParams,
  ChatRequest,
  ToolCall,
  ToolDefinition,
} from "@halonicjs/ports";

/** The field that limits the answer's length. OpenAI's newer models only take the second. */
export type MaxTokensField = "max_tokens" | "max_completion_tokens";

/** How a request is written for one provider. */
export interface RequestOptions {
  maxTokensField: MaxTokensField;
  /** Whether the answer comes as server-sent events; then the last event holds the usage. */
  stream: boolean;
}

/** One message in OpenAI's chat completions format. */
type WireMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: WireToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

interface WireToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  /** Gemini's thought signature, back where its reply put it. */
  extra_content?: { google: { thought_signature: string } };
}

interface WireTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/**
 * The JSON body of a `/v1/chat/completions` call for `request`. It builds a
 * new object and leaves `request` as it was. `meta` and `signal` are never
 * sent.
 */
export function toWireBody(request: ChatRequest, options: RequestOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    // `extra` goes first, so it can add vendor settings but never replace ours.
    ...withoutLengthFields(request.params?.extra),
    model: request.model,
    messages: request.messages.map(toWireMessage),
    ...wireParams(request.params ?? {}, options),
    stream: options.stream,
    ...(options.stream ? { stream_options: { include_usage: true } } : {}),
  };
  if (request.tools !== undefined && request.tools.length > 0) {
    body["tools"] = request.tools.map(toWireTool);
  }
  if (request.responseFormat === "json") body["response_format"] = { type: "json_object" };
  return body;
}

function toWireMessage(message: ChatMessage): WireMessage {
  switch (message.role) {
    case "system":
    case "user":
      return { role: message.role, content: message.content };
    case "assistant":
      return toWireAssistant(message.content, message.toolCalls ?? []);
    case "tool":
      return { role: "tool", content: message.content, tool_call_id: message.toolCallId };
  }
}

function toWireAssistant(content: string, toolCalls: ToolCall[]): WireMessage {
  if (toolCalls.length === 0) return { role: "assistant", content };
  return {
    role: "assistant",
    // An assistant turn that only calls tools has no text; vendors expect null there.
    content: content === "" ? null : content,
    tool_calls: toolCalls.map(toWireToolCall),
  };
}

/**
 * A tool call as the model wrote it. A call with a signature only came from
 * Gemini, so only Gemini ever gets `extra_content` back; other servers never
 * see the field.
 */
function toWireToolCall(call: ToolCall): WireToolCall {
  return {
    id: call.id,
    type: "function",
    function: { name: call.name, arguments: JSON.stringify(call.arguments) },
    ...(call.signature === undefined || call.signature === ""
      ? {}
      : { extra_content: { google: { thought_signature: call.signature } } }),
  };
}

function toWireTool(tool: ToolDefinition): WireTool {
  return {
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  };
}

/**
 * `extra` without either length field: the length comes from `maxTokens`, in
 * the one field the provider takes, and some vendors refuse a call with both.
 */
function withoutLengthFields(extra: ChatParams["extra"]): Record<string, unknown> {
  const {
    max_tokens: _maxTokens,
    max_completion_tokens: _maxCompletionTokens,
    ...rest
  } = extra ?? {};
  return rest;
}

/** The sampling settings that are set, under their wire names. An empty `stop` list is left out. */
function wireParams(params: ChatParams, options: RequestOptions): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    temperature: params.temperature,
    top_p: params.topP,
    [options.maxTokensField]: params.maxTokens,
    stop: params.stop?.length === 0 ? undefined : params.stop,
    reasoning_effort: params.reasoningEffort,
  };
  return Object.fromEntries(Object.entries(wire).filter(([, value]) => value !== undefined));
}
