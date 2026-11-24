import { type BridgeEvent, harnessBridgeTokenHeader } from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { anthropicRoute } from "./anthropic-route.ts";
import { openBridge } from "./bridge.ts";
import { fakeProvider } from "./fake-provider.test-helper.ts";
import { fakeRun } from "./fakes.test-helper.ts";

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

/** A reply that used `inputTokens` and `outputTokens`, as Anthropic answers a call that isn't streamed. */
function replyUsing(inputTokens: number, outputTokens: number): Response {
  return Response.json({
    content: [{ type: "text", text: "Done" }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  });
}

/** Claude Code's request: the program's own offers the `Task` tool, a sub-agent's doesn't. */
function requestOf(bridge: { url: string; token: string }, system: string, tools: string[]) {
  return fetch(`${bridge.url}/v1/messages`, {
    method: "POST",
    headers: { [harnessBridgeTokenHeader]: bridge.token, "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 1024,
      system,
      tools: tools.map((name) => ({ name, input_schema: { type: "object" } })),
      messages: [{ role: "user", content: "Look at notes.md" }],
    }),
  });
}

verifies("harness-bridge.sub-agent-spend", () => {
  it("records a sub-agent's calls under the run and its agent, next to the program's own", async () => {
    const anthropic = fakeProvider((call) =>
      call.body.includes('"Task"') ? replyUsing(1_000, 50) : replyUsing(300, 20),
    );
    const recorded: BridgeEvent[] = [];
    const run = {
      ...fakeRun(),
      providers: { anthropic: { kind: "key" as const, secret: "anthropic-key" } },
      recorder: { record: async (event: BridgeEvent) => void recorded.push(event) },
    };
    const bridge = await openBridge(run, {
      place: { kind: "loopback" },
      limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
      routes: [
        anthropicRoute({
          secrets: { get: async () => "anthropic-test-value" },
          fetch: anthropic.fetch,
          limits: { responseTimeoutMs: 2_000, idleTimeoutMs: 500 },
        }),
      ],
      closeTimeoutMs: 1_000,
    });
    closers.push(bridge.close);

    const replies = await Promise.all([
      requestOf(bridge, "You are Claude Code.", ["Read", "Task"]),
      requestOf(bridge, "You are an agent for Claude Code.", ["Read"]),
    ]);
    await Promise.all(replies.map((reply) => reply.text()));

    await waitUntil("recorded to have length 4", () => recorded.length === 4);
    expect(new Set(recorded.map((event) => event.agent))).toEqual(new Set(["writer"]));
    const usages = recorded.flatMap((event) =>
      event.type === "llm.response" ? [event.usage] : [],
    );
    expect(usages).toEqual(
      expect.arrayContaining([
        { inputTokens: 1_000, outputTokens: 50 },
        { inputTokens: 300, outputTokens: 20 },
      ]),
    );
  });
});
