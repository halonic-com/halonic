import { type BridgeEvent, harnessBridgeTokenHeader } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { anthropicRoute } from "./anthropic-route.ts";
import { openBridge } from "./bridge.ts";
import { fakeProvider } from "./fake-provider.test-helper.ts";
import { fakeRun } from "./fakes.test-helper.ts";
import {
  closeOpenedBridges,
  codexRequest,
  open as openOpenAi,
} from "./openai-route.test-helper.ts";
import type { Fetch } from "./pass-through.ts";

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
  await closeOpenedBridges();
});

/** Opens a bridge with the Anthropic route for an agent with a key, and keeps what it records. */
async function openAnthropic(fetch: Fetch) {
  const recorded: BridgeEvent[] = [];
  const run = {
    ...fakeRun(),
    providers: { anthropic: { kind: "key" as const, secret: "anthropic-key" } },
    price: () => null,
    recorder: { record: async (event: BridgeEvent) => void recorded.push(event) },
  };
  const bridge = await openBridge(run, {
    place: { kind: "loopback" },
    limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
    routes: [
      anthropicRoute({
        secrets: { get: async () => "anthropic-test-value" },
        fetch,
        limits: { responseTimeoutMs: 2_000, idleTimeoutMs: 500 },
      }),
    ],
    closeTimeoutMs: 1_000,
  });
  closers.push(bridge.close);
  return { bridge, recorded };
}

/** A Claude Code request through `bridge`, with the program's own `headers` added. */
function claudeCodeRequest(bridge: { url: string; token: string }, headers: object) {
  return fetch(`${bridge.url}/v1/messages`, {
    method: "POST",
    headers: {
      [harnessBridgeTokenHeader]: bridge.token,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: "Hi" }],
    }),
  });
}

/** A Codex request through `bridge`, with the program's own `headers` added. */
function codexCall(bridge: { url: string; token: string }, headers: object) {
  return fetch(`${bridge.url}/v1/responses`, {
    method: "POST",
    headers: {
      [harnessBridgeTokenHeader]: bridge.token,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(codexRequest),
  });
}

const anthropicReply = () =>
  Response.json({
    content: [{ type: "text", text: "Hi" }],
    usage: { input_tokens: 10, output_tokens: 2 },
  });

const openAiReply = () =>
  Response.json({ status: "completed", output: [], usage: { input_tokens: 10, output_tokens: 2 } });

/** The `subagent` of each `llm.request` and `llm.response` recorded, in order. */
function subagentsOf(recorded: BridgeEvent[]) {
  return recorded
    .filter((event) => event.type === "llm.request" || event.type === "llm.response")
    .map((event) => [event.type, "subagent" in event ? event.subagent : undefined]);
}

verifies("harness-bridge.subagent-calls", () => {
  describe("the Anthropic route", () => {
    it("marks both events of a call that carries x-claude-code-agent-id, without its id", async () => {
      const { bridge, recorded } = await openAnthropic(fakeProvider(anthropicReply).fetch);

      const reply = await claudeCodeRequest(bridge, {
        "x-claude-code-agent-id": "a0123456789abcdef",
      });
      await reply.text();

      expect(subagentsOf(recorded)).toEqual([
        ["llm.request", "subagent"],
        ["llm.response", "subagent"],
      ]);
      expect(JSON.stringify(recorded)).not.toContain("a0123456789abcdef");
    });

    it("leaves the agent's own calls unmarked", async () => {
      const { bridge, recorded } = await openAnthropic(fakeProvider(anthropicReply).fetch);

      await (await claudeCodeRequest(bridge, {})).text();

      expect(subagentsOf(recorded)).toEqual([
        ["llm.request", undefined],
        ["llm.response", undefined],
      ]);
    });
  });

  describe("the OpenAI route", () => {
    it("marks both events of a call that carries x-openai-subagent", async () => {
      const { bridge, recorded } = await openOpenAi(fakeProvider(openAiReply).fetch);

      await (await codexCall(bridge, { "x-openai-subagent": "collab_spawn" })).text();

      expect(subagentsOf(recorded)).toEqual([
        ["llm.request", "subagent"],
        ["llm.response", "subagent"],
      ]);
    });

    it("leaves the agent's own calls unmarked", async () => {
      const { bridge, recorded } = await openOpenAi(fakeProvider(openAiReply).fetch);

      await (await codexCall(bridge, {})).text();

      expect(subagentsOf(recorded)).toEqual([
        ["llm.request", undefined],
        ["llm.response", undefined],
      ]);
    });
  });
});
