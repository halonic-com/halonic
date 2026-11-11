import type { ChatRequest, ChatResponse, LlmProvider } from "@halonicjs/ports";
import { type HalonicTool, LocalExecutor } from "../src/index.ts";

// A stand-in model that first calls the `lookup` tool, then answers with what
// the tool returned. A real provider comes from an adapter, such as OpenAI's.
const model: LlmProvider = {
  id: "acme-model",
  type: "example",
  capabilities: { tools: true, jsonOutput: false, vision: false, streaming: false },
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const usage = { inputTokens: 12, outputTokens: 4 };
    const result = request.messages.find((message) => message.role === "tool");
    if (result === undefined) {
      const call = { id: "call_1", name: "lookup", arguments: { invoice: "INV-7" } };
      return { content: "", toolCalls: [call], usage, finishReason: "tool_calls" };
    }
    return { content: `It says: ${result.content}`, toolCalls: [], usage, finishReason: "stop" };
  },
};

// A Halonic tool that only reads. A chat runs it; it refuses a tool that
// writes or sends, and every connected server's tool counts as at least writing.
const lookup: HalonicTool = {
  definition: {
    name: "lookup",
    description: "Looks up an invoice",
    parameters: { type: "object", properties: { invoice: { type: "string" } } },
  },
  run: async (args) => `${String(args["invoice"])} is paid`,
};

/** Runs one chat turn through the local executor and returns what the caller gets back. */
export async function runExample(): Promise<{ answer: string; roles: string[]; model: string }> {
  const executor = new LocalExecutor({
    // Until workspaces have model aliases, the caller picks the model.
    resolveModel: async () => ({ provider: model, model: "acme-1" }),
    halonicTools: [lookup],
    connectors: [],
    // The stand-in model names no key, so no secret is ever looked up.
    secrets: { get: async () => null },
    clock: { now: () => new Date("2026-11-09T09:00:00Z") },
  });
  const response = await executor.chatTurn({
    hubId: "acme",
    messages: [{ role: "user", content: "Is INV-7 paid?" }],
    tools: [],
  });
  return {
    answer: response.content, // "It says: INV-7 is paid"
    // The messages to append to the conversation: ["assistant", "tool", "assistant"]
    roles: (response.turn ?? []).map((message) => message.role),
    model: response.model, // "acme-1"
  };
}
