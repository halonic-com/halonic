import type { ChatRequest, ChatResponse, ConnectorClient, LlmProvider } from "@halonicjs/ports";
import { LocalExecutor } from "../src/index.ts";

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
      const lookup = { id: "call_1", name: "lookup", arguments: { invoice: "INV-7" } };
      return { content: "", toolCalls: [lookup], usage, finishReason: "tool_calls" };
    }
    return { content: `It says: ${result.content}`, toolCalls: [], usage, finishReason: "stop" };
  },
};

// A connected server with one tool. Normally the host connects it from the workspace's connectors.
const billing: ConnectorClient = {
  id: "billing",
  listTools: async () => [
    {
      name: "lookup",
      description: "Looks up an invoice",
      parameters: { type: "object", properties: { invoice: { type: "string" } } },
      // A chat refuses a tool that writes or sends, and one that names no risk counts as such.
      risk: "read",
    },
  ],
  callTool: async (_name, args) => `${String(args["invoice"])} is paid`,
  close: async () => {},
};

/** Runs one chat turn through the local executor and returns what the caller gets back. */
export async function runExample(): Promise<{ answer: string; roles: string[]; model: string }> {
  const executor = new LocalExecutor({
    // Until workspaces have model aliases, the caller picks the model.
    resolveModel: async () => ({ provider: model, model: "acme-1" }),
    halonicTools: [],
    connectors: [billing],
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
