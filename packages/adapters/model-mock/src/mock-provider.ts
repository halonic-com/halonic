import type { Usage } from "@halonicjs/events";
import {
  type ChatRequest,
  type ChatResponse,
  type LlmCapabilities,
  type LlmProvider,
  ModelCallError,
} from "@halonicjs/ports";
import { deepClone } from "@halonicjs/std";
import { anyAgent, type MockReply, type MockScript, ReplyQueues } from "./script.ts";
import { readToolCalls } from "./tool-call-lines.ts";

/** The provider type of the mock model, as a workspace's `providers/*.yaml` names it. */
export const mockProviderType = "mock";

/** Gives the reply when an agent's script has run out. */
export type FallbackReply = (request: ChatRequest) => MockReply;

/**
 * A model that answers from a script and never touches the network. It gives
 * each agent its scripted replies in order (see {@link MockScript}); a reply
 * made of `tool:<name> <json>` lines calls those tools. When the script runs
 * out it uses the fallback, which by default echoes the last user message.
 *
 * Tool call ids count up per instance (`mock_call_1`, `mock_call_2` …), so
 * event logs come out the same on every run.
 *
 * @example
 * const model = new MockLlmProvider("mock", { writer: ["Hello"] });
 * const answer = await model.chat({ model: "any", messages: [], meta: { agentId: "writer" } });
 * answer.content; // "Hello"
 */
export class MockLlmProvider implements LlmProvider {
  readonly id: string;
  readonly type = mockProviderType;
  readonly capabilities: LlmCapabilities = {
    tools: true,
    jsonOutput: true,
    vision: false,
    streaming: false,
  };
  /** Every request the model was sent, in order, so a test can check what the engine asked. */
  readonly requests: ChatRequest[] = [];
  private readonly replies: ReplyQueues;
  private readonly fallback: FallbackReply;
  private callCount = 0;

  /**
   * @param id - the provider's id in the workspace
   * @param script - the scripted replies per agent id
   * @param fallback - the reply once an agent's script has run out; echoes the last user message when left out
   */
  constructor(
    id: string = mockProviderType,
    script: MockScript = {},
    fallback: FallbackReply = echoLastUserMessage,
  ) {
    this.id = id;
    this.replies = new ReplyQueues(script);
    this.fallback = fallback;
  }

  /** How many scripted replies are left per agent id; a test checks these are all 0. */
  remaining(): Record<string, number> {
    return this.replies.remaining();
  }

  /**
   * Answers with the agent's next scripted reply (see {@link MockReply}).
   *
   * @throws the signal's reason when `request.signal` aborts, before the call is recorded or while it hangs
   * @throws {ModelCallError} `refused` for a `{ refuse }` reply, or a hang without a signal, which would never end
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    request.signal?.throwIfAborted();
    this.requests.push(request);
    const agentId = request.meta?.agentId ?? anyAgent;
    const reply = this.replies.next(agentId) ?? this.fallback(request);
    if (typeof reply !== "string") {
      return answerWith(reply, request.signal);
    }
    const usage = estimateUsage(request, reply);
    const toolCalls = readToolCalls(reply, () => this.nextCallId());
    if (toolCalls !== null) {
      return { content: "", toolCalls, usage, finishReason: "tool_calls" };
    }
    return { content: reply, toolCalls: [], usage, finishReason: "stop" };
  }

  private nextCallId(): string {
    this.callCount += 1;
    return `mock_call_${this.callCount}`;
  }
}

/** Gives back a whole scripted answer, refuses, or hangs until the signal aborts. */
async function answerWith(
  reply: Exclude<MockReply, string>,
  signal: AbortSignal | undefined,
): Promise<ChatResponse> {
  if ("refuse" in reply) {
    throw new ModelCallError("refused", reply.refuse);
  }
  if ("hang" in reply) {
    if (signal === undefined) {
      throw new ModelCallError("refused", "A scripted hang needs a signal to end it.");
    }
    await new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  }
  return deepClone(reply as ChatResponse);
}

/** The default fallback: the text of the last user message, or "" when there is none. */
export function echoLastUserMessage(request: ChatRequest): string {
  const lastUser = request.messages.findLast((message) => message.role === "user");
  return lastUser?.content ?? "";
}

/**
 * Token counts at about four characters a token, so budget and cost code has
 * numbers to work with. The old mock counted the same way; budget tests and
 * recorded event logs depend on the exact numbers.
 */
function estimateUsage(request: ChatRequest, reply: string): Usage {
  const inputCharacters = request.messages.reduce(
    (total, message) => total + message.content.length,
    0,
  );
  return {
    inputTokens: Math.ceil(inputCharacters / 4),
    outputTokens: Math.ceil(reply.length / 4),
  };
}
