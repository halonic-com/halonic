import type {
  ChatRequest,
  ChatResponse,
  ConnectorClient,
  ConnectorTool,
  LlmProvider,
  ToolCall,
} from "@halonicjs/ports";

/**
 * An `LlmProvider` that gives scripted answers in order and records every
 * request, for the engine's own tests. A deliberate fake, like `TestExecutor`
 * in `core/app`: core may not use adapters, not even in tests. The parity
 * mock model in `packages/testing` replaces it once it exists. Not exported
 * from the package, so nothing outside its tests can depend on it.
 */
export class ScriptedModel implements LlmProvider {
  readonly id = "scripted";
  readonly type = "scripted";
  readonly capabilities = { tools: true, jsonOutput: false, vision: false, streaming: false };
  /** Every request, in order, with a copy of its messages as they were then. */
  readonly requests: ChatRequest[] = [];
  private readonly answers: ChatResponse[];

  constructor(answers: ChatResponse[]) {
    this.answers = [...answers];
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    this.requests.push({ ...request, messages: [...request.messages] });
    const answer = this.answers.shift();
    if (answer === undefined) {
      throw new Error("the scripted model has no answer left");
    }
    return answer;
  }
}

/** A scripted answer with text only. */
export function textAnswer(content: string): ChatResponse {
  return {
    content,
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5 },
    finishReason: "stop",
  };
}

/** A scripted answer that calls tools. */
export function callAnswer(...toolCalls: ToolCall[]): ChatResponse {
  return {
    content: "",
    toolCalls,
    usage: { inputTokens: 10, outputTokens: 5 },
    finishReason: "tool_calls",
  };
}

/** A tool call with arguments. */
export function call(id: string, name: string, args: Record<string, unknown> = {}): ToolCall {
  return { id, name, arguments: args };
}

/** A connector that lists fixed tools and answers calls with a function, recording each call. */
export class ScriptedConnector implements ConnectorClient {
  readonly calls: { name: string; args: Record<string, unknown> }[] = [];
  readonly id: string;
  private readonly tools: ConnectorTool[] | Error;
  private readonly answer: (name: string, args: Record<string, unknown>) => string;

  /**
   * @param tools - what `listTools` returns, or the error it throws
   * @param answer - the result of a call; "<name> done" when left out
   */
  constructor(
    id: string,
    tools: ConnectorTool[] | Error,
    answer: (name: string, args: Record<string, unknown>) => string = (name) => `${name} done`,
  ) {
    this.id = id;
    this.tools = tools;
    this.answer = answer;
  }

  async listTools(): Promise<ConnectorTool[]> {
    if (this.tools instanceof Error) {
      throw this.tools;
    }
    return this.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    this.calls.push({ name, args });
    return this.answer(name, args);
  }

  async close(): Promise<void> {}
}

/** A connector tool with an empty object as parameters. */
export function listedTool(name: string): ConnectorTool {
  return { name, description: `Does ${name}`, parameters: { type: "object", properties: {} } };
}
