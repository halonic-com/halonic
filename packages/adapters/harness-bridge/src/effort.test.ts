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
import { openAiRoute } from "./openai-route.ts";

/** The value the fake secrets hold for the agent's key. Not a real key. */
const agentKey = "effort-test-value";

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

/** A keyed access whose alias set the effort `low` for `cheap-model`. */
const lowForCheapModel: BridgeProviderAccess = {
  kind: "key",
  secret: "agent-key",
  efforts: { "cheap-model": "low" },
};

/**
 * Opens a bridge with both model routes for an agent with `access` on
 * `provider`, and keeps what it records and the calls that reach the provider.
 */
async function open(provider: "anthropic" | "openai", access: BridgeProviderAccess) {
  const recorded: BridgeEvent[] = [];
  const upstream = fakeProvider(() => Response.json({ type: "message", content: [] }));
  const dependencies = {
    secrets: { get: async (name: string) => (name === "agent-key" ? agentKey : null) },
    fetch: upstream.fetch,
    limits: { responseTimeoutMs: 2_000, idleTimeoutMs: 500 },
  };
  const run = {
    ...fakeRun(),
    providers: { [provider]: access },
    recorder: { record: async (event: BridgeEvent) => void recorded.push(event) },
  };
  const bridge = await openBridge(run, {
    place: { kind: "loopback" },
    limits: { maxBytes: 1024 * 1024, timeoutMs: 5_000 },
    closeTimeoutMs: 1_000,
    routes: [anthropicRoute(dependencies), openAiRoute(dependencies)],
  });
  closers.push(bridge.close);
  return { bridge, recorded, upstream };
}

/** Sends `body` on the route of `provider` and gives the body the provider got. */
async function providerGets(
  opened: Awaited<ReturnType<typeof open>>,
  provider: "anthropic" | "openai",
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const path = provider === "anthropic" ? "/v1/messages" : "/v1/responses";
  const reply = await fetch(`${opened.bridge.url}${path}`, {
    method: "POST",
    headers: {
      // The program's own sign-in, which a sign-in access passes on; a keyed one replaces it.
      authorization: "Bearer effort-test-sign-in",
      [harnessBridgeTokenHeader]: opened.bridge.token,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  expect(reply.status).toBe(200);
  await reply.arrayBuffer();
  const sent = opened.upstream.calls.at(-1)?.body;
  return JSON.parse(sent ?? "null") as Record<string, unknown>;
}

/** The `effort` of each `llm.request` the bridge recorded, `undefined` for one without. */
function recordedEfforts(recorded: readonly BridgeEvent[]): unknown[] {
  return recorded
    .filter((event) => event.type === "llm.request")
    .map((event) => ("effort" in event ? event.effort : undefined));
}

verifies("harness-bridge.effort", () => {
  describe("the Anthropic route", () => {
    it("sets output_config.effort for the model and leaves thinking alone", async () => {
      const opened = await open("anthropic", lowForCheapModel);

      const sent = await providerGets(opened, "anthropic", {
        model: "cheap-model",
        max_tokens: 32_000,
        messages: [],
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
      });

      expect(sent["output_config"]).toEqual({ effort: "low" });
      expect(sent["thinking"]).toEqual({ type: "adaptive" });
      expect(sent["max_tokens"]).toBe(32_000);
      expect(recordedEfforts(opened.recorded)).toEqual(["low"]);
    });

    it("keeps the other keys of output_config", async () => {
      const opened = await open("anthropic", lowForCheapModel);
      const format = { type: "json_schema", schema: { type: "object" } };

      const sent = await providerGets(opened, "anthropic", {
        model: "cheap-model",
        max_tokens: 64,
        messages: [],
        output_config: { format },
      });

      expect(sent["output_config"]).toEqual({ format, effort: "low" });
    });

    it("sends a call for another model as the program wrote it", async () => {
      const opened = await open("anthropic", lowForCheapModel);
      const body = { model: "claude-haiku-4-5", max_tokens: 64, messages: [] };

      const sent = await providerGets(opened, "anthropic", body);

      expect(sent).toEqual(body);
      expect(recordedEfforts(opened.recorded)).toEqual([undefined]);
    });

    it("takes only the table's own entries", async () => {
      const opened = await open("anthropic", lowForCheapModel);
      const body = { model: "toString", max_tokens: 64, messages: [] };

      expect(await providerGets(opened, "anthropic", body)).toEqual(body);
    });
  });

  describe("the OpenAI route", () => {
    it("sets reasoning.effort for the model and keeps its summary", async () => {
      const opened = await open("openai", lowForCheapModel);

      const sent = await providerGets(opened, "openai", {
        model: "cheap-model",
        input: [],
        store: false,
        reasoning: { effort: "high", summary: "auto" },
      });

      expect(sent["reasoning"]).toEqual({ effort: "low", summary: "auto" });
      expect(recordedEfforts(opened.recorded)).toEqual(["low"]);
    });
  });

  describe.each(["anthropic", "openai"] as const)("the %s route", (provider) => {
    it("changes nothing for a sign-in access without efforts", async () => {
      const opened = await open(provider, { kind: "sign-in" });
      const body = { model: "cheap-model", input: [], messages: [], max_tokens: 64 };

      expect(await providerGets(opened, provider, body)).toEqual(body);
      expect(recordedEfforts(opened.recorded)).toEqual([undefined]);
    });

    it("sets the effort for a sign-in access that names one", async () => {
      const opened = await open(provider, {
        kind: "sign-in",
        efforts: { "cheap-model": "medium" },
      });
      const body = { model: "cheap-model", input: [], messages: [], max_tokens: 64 };

      const sent = await providerGets(opened, provider, body);

      const field = provider === "anthropic" ? "output_config" : "reasoning";
      expect(sent[field]).toEqual({ effort: "medium" });
      expect(recordedEfforts(opened.recorded)).toEqual(["medium"]);
    });
  });
});

/** The `programEffort` of each `llm.request` the bridge recorded, `undefined` for one without. */
function recordedProgramEfforts(recorded: readonly BridgeEvent[]): unknown[] {
  return recorded
    .filter((event) => event.type === "llm.request")
    .map((event) => ("programEffort" in event ? event.programEffort : undefined));
}

verifies("harness-bridge.program-effort", () => {
  it("records the program's output_config.effort next to the one the bridge set", async () => {
    const opened = await open("anthropic", lowForCheapModel);

    const sent = await providerGets(opened, "anthropic", {
      model: "cheap-model",
      max_tokens: 64,
      messages: [],
      output_config: { effort: "high" },
    });

    expect(sent["output_config"]).toEqual({ effort: "low" });
    expect(recordedEfforts(opened.recorded)).toEqual(["low"]);
    expect(recordedProgramEfforts(opened.recorded)).toEqual(["high"]);
  });

  it("records the program's reasoning.effort when the access names no effort", async () => {
    const opened = await open("openai", { kind: "sign-in" });
    const body = { model: "gpt-5.5", input: [], reasoning: { effort: "xhigh" } };

    expect(await providerGets(opened, "openai", body)).toEqual(body);
    expect(recordedEfforts(opened.recorded)).toEqual([undefined]);
    expect(recordedProgramEfforts(opened.recorded)).toEqual(["xhigh"]);
  });

  it.each([
    ["no effort", { model: "cheap-model", max_tokens: 64, messages: [] }],
    [
      "an effort outside the list",
      { model: "cheap-model", max_tokens: 64, messages: [], output_config: { effort: "turbo" } },
    ],
    [
      "an effort that isn't text",
      { model: "cheap-model", max_tokens: 64, messages: [], output_config: { effort: 3 } },
    ],
  ])("records no program effort for %s, and sends the request as before", async (_, body) => {
    const opened = await open("anthropic", { kind: "sign-in" });

    expect(await providerGets(opened, "anthropic", body)).toEqual(body);
    expect(recordedProgramEfforts(opened.recorded)).toEqual([undefined]);
  });
});
