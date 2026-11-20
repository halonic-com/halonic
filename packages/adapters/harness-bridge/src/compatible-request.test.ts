import { type BridgeProviderAccess, harnessBridgeTokenHeader } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { anthropicRoute } from "./anthropic-route.ts";
import { openBridge } from "./bridge.ts";
import { fakeProvider } from "./fake-provider.test-helper.ts";
import { fakeRun } from "./fakes.test-helper.ts";
import {
  closeOpenedBridges,
  codexRequest,
  programRequest as codexSends,
  open as openOpenAi,
} from "./openai-route.test-helper.ts";
import type { Fetch } from "./pass-through.ts";

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
  await closeOpenedBridges();
});

const answered = () => Response.json({ type: "message", content: [], output: [] });

/** The message of the bridge's error reply. */
async function refusal(reply: Response): Promise<string> {
  const { error } = (await reply.json()) as { error: { message: string } };
  return error.message;
}

/** A keyed agent at a compatible provider. */
const atCompatible: BridgeProviderAccess = {
  kind: "key",
  secret: "openai-key",
  baseUrl: "https://compatible.example/api/v1",
  models: ["glm-5.2", "gpt-5.5", "openai/gpt-5.5"],
};

/** Opens a bridge that serves only the Anthropic route, for an agent with `access`. */
async function openAnthropic(access: BridgeProviderAccess, fetch: Fetch, compatibleFetch: Fetch) {
  const route = anthropicRoute({
    secrets: { get: async () => "compatible-test-value" },
    fetch,
    compatibleFetch,
    limits: { responseTimeoutMs: 2_000, idleTimeoutMs: 500 },
  });
  const run = {
    ...fakeRun(),
    providers: { anthropic: access },
    recorder: { record: async () => {} },
  };
  const bridge = await openBridge(run, {
    place: { kind: "loopback" },
    limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
    closeTimeoutMs: 1_000,
    routes: [route],
  });
  closers.push(bridge.close);
  return bridge;
}

/** Claude Code's request, with `extra` added to a plain one. */
function claudeCodeSends(bridge: { url: string; token: string }, extra: object) {
  return claudeCodeSendsText(
    bridge,
    JSON.stringify({ model: "glm-5.2", max_tokens: 64, messages: [], ...extra }),
  );
}

/** Claude Code's request as written, such as JSON that repeats a key. */
function claudeCodeSendsText(bridge: { url: string; token: string }, body: string) {
  return fetch(`${bridge.url}/v1/messages`, {
    method: "POST",
    headers: {
      [harnessBridgeTokenHeader]: bridge.token,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body,
  });
}

/** A request with every kind of thing Claude Code sends: its own tools, thinking, caching and effort. */
const claudeCodeRequest = {
  system: [{ type: "text", text: "You are Claude Code.", cache_control: { type: "ephemeral" } }],
  tools: [
    { name: "Read", input_schema: { type: "object" } },
    { type: "custom", name: "Edit", input_schema: { type: "object" } },
    { type: "bash_20250124", name: "bash" },
    { type: "text_editor_20250728", name: "str_replace_based_edit_tool" },
  ],
  tool_choice: { type: "auto" },
  thinking: { type: "adaptive" },
  output_config: { effort: "high" },
  metadata: { user_id: "placeholder" },
  stream: true,
};

verifies("harness-bridge.compatible-request", () => {
  describe("the Anthropic route at a compatible provider", () => {
    it("sends a request of known fields and the program's own tools, unchanged", async () => {
      const ownHosts = fakeProvider(answered);
      const compatible = fakeProvider(answered);
      const bridge = await openAnthropic(atCompatible, ownHosts.fetch, compatible.fetch);

      expect((await claudeCodeSends(bridge, claudeCodeRequest)).status).toBe(200);

      expect(JSON.parse(compatible.calls[0]?.body ?? "")).toMatchObject(claudeCodeRequest);
    });

    it("removes mcp_servers, as at Anthropic", async () => {
      const ownHosts = fakeProvider(answered);
      const compatible = fakeProvider(answered);
      const bridge = await openAnthropic(atCompatible, ownHosts.fetch, compatible.fetch);

      expect((await claudeCodeSends(bridge, { mcp_servers: [] })).status).toBe(200);

      expect(JSON.parse(compatible.calls[0]?.body ?? "")).not.toHaveProperty("mcp_servers");
    });

    it.each<[string, object, string]>([
      ["OpenRouter's web plugin", { plugins: [{ id: "web" }] }, '"plugins"'],
      ["a provider's own routing field", { provider: { order: ["x"] } }, '"provider"'],
      ["a server-side container", { container: "container-placeholder" }, '"container"'],
      ["fallback models", { fallbacks: [{ model: "sonar-pro" }] }, '"fallbacks"'],
      ["a web search tool", { tools: [{ type: "web_search_20260209" }] }, '"web_search_20260209"'],
      [
        "a code execution tool",
        { tools: [{ type: "code_execution_20260521" }] },
        '"code_execution',
      ],
      [
        "a provider's own tool type",
        { tools: [{ type: "web_browse", name: "b" }] },
        '"web_browse"',
      ],
      ["a made-up type named like a client tool", { tools: [{ type: "bash_web" }] }, '"bash_web"'],
      [
        "a client tool type with more after the date",
        { tools: [{ type: "computer_20250124_remote" }] },
        '"computer_20250124_remote"',
      ],
      ["a tool choice of a server tool", { tool_choice: { type: "web_search" } }, "tool_choice"],
      ["the :online model suffix", { model: "glm-5.2:online" }, ":online"],
      ["the :online suffix in capitals", { model: "glm-5.2:ONLINE" }, ":online"],
    ])("refuses %s with a 403 that says why, and calls no provider", async (_case, extra, says) => {
      const ownHosts = fakeProvider(answered);
      const compatible = fakeProvider(answered);
      const bridge = await openAnthropic(atCompatible, ownHosts.fetch, compatible.fetch);

      const reply = await claudeCodeSends(bridge, extra);

      expect(reply.status).toBe(403);
      expect(await refusal(reply)).toContain(says);
      expect([...ownHosts.calls, ...compatible.calls]).toEqual([]);
    });

    it.each<[string, string]>([
      ["a repeated model", '{"model":"glm-5.2:online","model":"glm-5.2","max_tokens":64}'],
      [
        "a repeated tool type",
        '{"model":"glm-5.2","tools":[{"type":"web_search_20260209","type":"custom","name":"x"}]}',
      ],
    ])("sends %s only as the bridge read it", async (_case, body) => {
      const ownHosts = fakeProvider(answered);
      const compatible = fakeProvider(answered);
      const bridge = await openAnthropic(atCompatible, ownHosts.fetch, compatible.fetch);

      expect((await claudeCodeSendsText(bridge, body)).status).toBe(200);

      expect(compatible.calls[0]?.body).toBe(JSON.stringify(JSON.parse(body)));
    });

    it("cuts a long field name to 64 characters in its error", async () => {
      const ownHosts = fakeProvider(answered);
      const compatible = fakeProvider(answered);
      const bridge = await openAnthropic(atCompatible, ownHosts.fetch, compatible.fetch);
      const longName = `${"a".repeat(64)}${"b".repeat(36)}`;

      const message = await refusal(await claudeCodeSends(bridge, { [longName]: 1 }));

      expect(message).toContain(`"${"a".repeat(64)}…"`);
      expect(message).not.toContain(longName.slice(0, 65));
    });

    it.each<[string, object]>([
      ["an unknown field", { plugins: [{ id: "value-marker" }] }],
      ["the :online suffix", { model: "value-marker:online" }],
    ])("names no value of the request when it refuses %s", async (_case, extra) => {
      const ownHosts = fakeProvider(answered);
      const compatible = fakeProvider(answered);
      const bridge = await openAnthropic(atCompatible, ownHosts.fetch, compatible.fetch);

      const reply = await claudeCodeSends(bridge, extra);

      expect(reply.status).toBe(403);
      expect(await refusal(reply)).not.toContain("value-marker");
    });

    it("leaves a call to Anthropic's own host to the rules there", async () => {
      const ownHosts = fakeProvider(answered);
      const compatible = fakeProvider(answered);
      const keyed: BridgeProviderAccess = { kind: "key", secret: "anthropic-key" };
      const bridge = await openAnthropic(keyed, ownHosts.fetch, compatible.fetch);

      const reply = await claudeCodeSends(bridge, {
        container: "container-placeholder",
        speed: "fast",
      });

      expect(reply.status).toBe(200);
      expect(ownHosts.calls).toHaveLength(1);
    });
  });

  describe("the OpenAI route at a compatible provider", () => {
    it("sends Codex's request and its own tools, unchanged", async () => {
      const ownHosts = fakeProvider(answered);
      const compatible = fakeProvider(answered);
      const { bridge } = await openOpenAi(ownHosts.fetch, atCompatible, compatible.fetch);
      const request = {
        ...codexRequest,
        tools: [
          ...codexRequest.tools,
          { type: "custom", name: "apply_patch" },
          { type: "local_shell" },
        ],
        tool_choice: { type: "allowed_tools", mode: "auto", tools: [{ type: "local_shell" }] },
        parallel_tool_calls: false,
        reasoning: { effort: "high" },
        include: ["reasoning.encrypted_content"],
        prompt_cache_key: "placeholder",
      };

      expect((await codexSends(bridge, request)).status).toBe(200);

      expect(JSON.parse(compatible.calls[0]?.body ?? "")).toEqual(request);
    });

    it("sends a repeated model only as the bridge read it", async () => {
      const ownHosts = fakeProvider(answered);
      const compatible = fakeProvider(answered);
      const { bridge } = await openOpenAi(ownHosts.fetch, atCompatible, compatible.fetch);
      const body = '{"model":"openai/gpt-5.5:online","model":"openai/gpt-5.5","input":[]}';

      expect((await codexSends(bridge, body)).status).toBe(200);

      expect(compatible.calls[0]?.body).toBe(JSON.stringify(JSON.parse(body)));
    });

    it.each<[string, object, string]>([
      ["OpenRouter's web plugin", { plugins: [{ id: "web" }] }, '"plugins"'],
      ["OpenRouter's fallback models", { models: ["a", "b"] }, '"models"'],
      ["a hosted file search", { tools: [{ type: "file_search" }] }, '"file_search"'],
      [
        "a hosted code interpreter",
        { tools: [{ type: "code_interpreter" }] },
        '"code_interpreter"',
      ],
      ["a tool choice of a hosted tool", { tool_choice: { type: "file_search" } }, "tool_choice"],
      [
        "an allowed_tools choice with a hosted tool",
        { tool_choice: { type: "allowed_tools", tools: [{ type: "image_generation" }] } },
        "tool_choice",
      ],
      ["the :online model suffix", { model: "openai/gpt-5.5:online" }, ":online"],
    ])("refuses %s with a 403 that says why, and calls no provider", async (_case, extra, says) => {
      const ownHosts = fakeProvider(answered);
      const compatible = fakeProvider(answered);
      const { bridge } = await openOpenAi(ownHosts.fetch, atCompatible, compatible.fetch);

      const reply = await codexSends(bridge, { ...codexRequest, ...extra });

      expect(reply.status).toBe(403);
      expect(await refusal(reply)).toContain(says);
      expect([...ownHosts.calls, ...compatible.calls]).toEqual([]);
    });
  });
});
