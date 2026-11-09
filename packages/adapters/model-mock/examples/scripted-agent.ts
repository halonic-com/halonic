import { MockLlmProvider } from "../src/index.ts";

/** A scripted agent that first calls a tool and then answers, with no network and the same output every time. */
export async function runExample(): Promise<{
  toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[];
  answer: string;
  left: Record<string, number>;
}> {
  // Each agent gets its replies in order. A `tool:<name> <json>` line calls a tool.
  const model = new MockLlmProvider("mock", {
    support: ['tool:search_handbook {"query":"refund"}', "Refunds take 5 days."],
  });
  const ask = { model: "any", messages: [], meta: { agentId: "support" } };

  const first = await model.chat(ask); // asks for search_handbook, id "mock_call_1"
  const second = await model.chat(ask); // "Refunds take 5 days."

  return {
    toolCalls: first.toolCalls,
    answer: second.content,
    left: model.remaining(), // { support: 0 }: the script was used up
  };
}
