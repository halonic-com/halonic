import {
  type BridgeEvent,
  type BridgeProviderAccess,
  harnessBridgeTokenHeader,
} from "@halonicjs/ports";
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

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
  await closeOpenedBridges();
});

const answered = () => Response.json({ type: "message", content: [], output: [] });

/** A keyed agent at a compatible provider, with the models the host resolved for it. */
function atCompatible(models?: readonly string[]): BridgeProviderAccess {
  return {
    kind: "key",
    secret: "openai-key",
    baseUrl: "https://compatible.example/api/v1",
    ...(models === undefined ? {} : { models }),
  };
}

/**
 * Opens a bridge that serves only the Anthropic route, for an agent with
 * `access`, and keeps what it records and every error it reports.
 */
async function openAnthropic(access: BridgeProviderAccess) {
  const ownHosts = fakeProvider(answered);
  const compatible = fakeProvider(answered);
  const recorded: BridgeEvent[] = [];
  const reported: unknown[] = [];
  const route = anthropicRoute({
    secrets: { get: async () => "compatible-test-value" },
    fetch: ownHosts.fetch,
    compatibleFetch: compatible.fetch,
    limits: { responseTimeoutMs: 2_000, idleTimeoutMs: 500 },
  });
  const run = {
    ...fakeRun(),
    providers: { anthropic: access },
    recorder: { record: async (event: BridgeEvent) => void recorded.push(event) },
    reportError: (failure: unknown) => void reported.push(failure),
  };
  const bridge = await openBridge(run, {
    place: { kind: "loopback" },
    limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
    closeTimeoutMs: 1_000,
    routes: [route],
  });
  closers.push(bridge.close);
  const calls = () => [...ownHosts.calls, ...compatible.calls];
  return { bridge, recorded, reported, calls };
}

/** Claude Code's request for `model`. */
function claudeCodeSends(bridge: { url: string; token: string }, model: string) {
  return messagesRequest(bridge, JSON.stringify({ model, max_tokens: 64, messages: [] }));
}

/** A Messages request with `body` as its JSON text. */
function messagesRequest(bridge: { url: string; token: string }, body: string) {
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

/** The message of the bridge's error reply. */
async function refusal(reply: Response): Promise<string> {
  const { error } = (await reply.json()) as { error: { message: string } };
  return error.message;
}

verifies("harness-bridge.compatible-request", () => {
  describe("the model at a compatible provider", () => {
    it("sends a call for one of the models the host resolved", async () => {
      const { bridge, calls } = await openAnthropic(atCompatible(["glm-5.2", "glm-5.2-air"]));

      expect((await claudeCodeSends(bridge, "glm-5.2-air")).status).toBe(200);

      expect(calls()).toHaveLength(1);
    });

    it.each<[string, string]>([
      ["a model that searches the web on its own", "perplexity/sonar-pro"],
      ["the model in other capitals", "GLM-5.2"],
      ["the model with a space after it", "glm-5.2 "],
      ["a longer name that starts with the model", "glm-5.2-search"],
    ])("refuses %s with a 403, and calls no provider", async (_case, model) => {
      const { bridge, calls } = await openAnthropic(atCompatible(["glm-5.2"]));

      const reply = await claudeCodeSends(bridge, model);

      expect(reply.status).toBe(403);
      expect(calls()).toEqual([]);
    });

    it.each<[string, readonly string[] | undefined]>([
      ["no models", undefined],
      ["an empty list of models", []],
    ])("refuses every call when the host gave %s", async (_case, models) => {
      const { bridge, calls } = await openAnthropic(atCompatible(models));

      const reply = await claudeCodeSends(bridge, "glm-5.2");

      expect(reply.status).toBe(403);
      expect(calls()).toEqual([]);
    });

    it("still refuses the :online suffix of a model the host resolved", async () => {
      const { bridge, calls } = await openAnthropic(atCompatible(["glm-5.2:online"]));

      const reply = await claudeCodeSends(bridge, "glm-5.2:online");

      expect(reply.status).toBe(403);
      expect(await refusal(reply)).toContain(":online");
      expect(calls()).toEqual([]);
    });

    it("names neither the model nor the list in its reply or its events", async () => {
      const access = atCompatible(["listed-marker"]);
      const { bridge, recorded, reported } = await openAnthropic(access);

      const reply = await claudeCodeSends(bridge, "asked-marker");

      expect(reply.status).toBe(403);
      const told = JSON.stringify([await refusal(reply), recorded, reported]);
      expect(told).not.toContain("asked-marker");
      expect(told).not.toContain("listed-marker");
      expect(recorded.map((event) => event.type)).not.toContain("llm.request");
    });

    it("keeps only the keyed-model check for a call to Anthropic's own host", async () => {
      const keyed: BridgeProviderAccess = {
        kind: "key",
        secret: "anthropic-key",
        models: ["claude-sonnet-5-5"],
      };
      const { bridge, calls } = await openAnthropic(keyed);

      expect((await claudeCodeSends(bridge, "claude-sonnet-5-5")).status).toBe(200);

      expect(calls()).toHaveLength(1);
    });

    it("refuses a Responses call for a model the host didn't resolve", async () => {
      const ownHosts = fakeProvider(answered);
      const compatible = fakeProvider(answered);
      const access = atCompatible(["openai/gpt-5.5"]);
      const { bridge, recorded } = await openOpenAi(ownHosts.fetch, access, compatible.fetch);

      const reply = await codexSends(bridge, { ...codexRequest, model: "openai/gpt-5.5-search" });

      expect(reply.status).toBe(403);
      expect(await refusal(reply)).not.toContain("gpt-5.5");
      expect(recorded).toEqual([]);
      expect([...ownHosts.calls, ...compatible.calls]).toEqual([]);
    });

    it("refuses every Responses call when the host gave no models", async () => {
      const ownHosts = fakeProvider(answered);
      const compatible = fakeProvider(answered);
      const { bridge } = await openOpenAi(ownHosts.fetch, atCompatible(), compatible.fetch);

      const reply = await codexSends(bridge, { ...codexRequest, model: "gpt-5.5" });

      expect(reply.status).toBe(403);
      expect([...ownHosts.calls, ...compatible.calls]).toEqual([]);
    });

    // Such a body has no model to check, so it is refused like a model the host didn't resolve.
    it.each<[string, string]>([
      ["a list", "[]"],
      ["a string", '"x"'],
      ["null", "null"],
    ])("refuses a body that is %s, on both routes, and calls no provider", async (_case, body) => {
      const anthropic = await openAnthropic(atCompatible(["glm-5.2"]));
      const ownHosts = fakeProvider(answered);
      const compatible = fakeProvider(answered);
      const openAi = await openOpenAi(ownHosts.fetch, atCompatible(["glm-5.2"]), compatible.fetch);

      const messagesReply = await messagesRequest(anthropic.bridge, body);
      const responsesReply = await codexSends(openAi.bridge, body);

      expect(messagesReply.status).toBe(403);
      expect(responsesReply.status).toBe(403);
      expect(anthropic.calls()).toEqual([]);
      expect([...ownHosts.calls, ...compatible.calls]).toEqual([]);
    });
  });
});
