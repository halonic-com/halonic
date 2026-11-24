import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { answerBody, openBridgeBody, priceIn } from "./bridge-schemas.ts";

describe("priceIn", () => {
  it("finds a model's price, and never one the table inherits", () => {
    const table = { anthropic: { "claude-sonnet-5-5": { input: 3, output: 15 } } };
    expect(priceIn(table, "anthropic", "claude-sonnet-5-5")).toEqual({ input: 3, output: 15 });
    expect(priceIn(table, "anthropic", "constructor")).toBeNull();
    expect(priceIn(table, "openai", "gpt-5")).toBeNull();
  });
});

describe("answerBody", () => {
  const ids = { bridge: "b1", call: "1" };

  it("takes a result, or an error as text", () => {
    expect(parse(answerBody, { ...ids, result: { kind: "run" } }).ok).toBe(true);
    expect(parse(answerBody, { ...ids, result: null }).ok).toBe(true);
    expect(parse(answerBody, { ...ids, error: "the connection is gone" }).ok).toBe(true);
  });

  it("refuses anything else: no answer, both, an error that isn't text, extra keys", () => {
    for (const body of [
      ids,
      { ...ids, result: 1, error: "x" },
      { ...ids, error: { message: "x" } },
      { ...ids, error: null },
      { ...ids, result: 1, extra: true },
      { bridge: "b1", result: 1 },
      { call: "1", result: 1 },
      { ...ids, call: 1, result: 1 },
    ]) {
      expect(parse(answerBody, body).ok, JSON.stringify(body)).toBe(false);
    }
  });
});

verifies("studio.harness-provider-key", () => {
  describe("openBridgeBody", () => {
    const body = (anthropic: unknown) => ({
      runId: "run_1",
      agentId: "coder",
      providers: { anthropic },
      prices: {},
    });

    it("takes a key's compatible provider: its baseUrl, its file's id and its models", () => {
      const zai = {
        kind: "key",
        secret: "zai-key",
        providerId: "zai",
        baseUrl: "https://api.z.ai/api/anthropic",
        models: ["glm-5.3"],
      };
      expect(parse(openBridgeBody, body(zai))).toEqual({ ok: true, value: body(zai) });
      expect(parse(openBridgeBody, body({ kind: "key", secret: "zai-key" })).ok).toBe(true);
    });

    it("refuses an empty baseUrl, provider id or model, and a field the port doesn't have", () => {
      for (const anthropic of [
        { kind: "key", secret: "zai-key", baseUrl: "" },
        { kind: "key", secret: "zai-key", providerId: "" },
        { kind: "key", secret: "zai-key", models: [""] },
        { kind: "key", secret: "zai-key", models: "glm-5.3" },
        { kind: "key", secret: "zai-key", headers: { "x-api-key": "fake" } },
        { kind: "sign-in", baseUrl: "https://api.z.ai/api/anthropic" },
      ]) {
        expect(parse(openBridgeBody, body(anthropic)).ok, JSON.stringify(anthropic)).toBe(false);
      }
    });
  });
});

verifies("harness-host.bridge-effort", () => {
  describe("openBridgeBody", () => {
    const body = (anthropic: unknown) => ({
      runId: "run_1",
      agentId: "coder",
      providers: { anthropic },
      prices: {},
    });

    it("takes the efforts of a key and of a sign-in, so Studio's bridge sets them too", () => {
      for (const access of [
        { kind: "key", secret: "zai-key", efforts: { "glm-5.3": "low" } },
        { kind: "sign-in", efforts: { "claude-haiku-5-5": "medium" } },
      ]) {
        expect(parse(openBridgeBody, body(access))).toEqual({ ok: true, value: body(access) });
      }
    });

    it("refuses an effort the bridge doesn't know", () => {
      const access = { kind: "sign-in", efforts: { "claude-opus-5-5": "max" } };
      expect(parse(openBridgeBody, body(access)).ok).toBe(false);
    });
  });
});

verifies("harness-host.bridge-routing", () => {
  describe("openBridgeBody", () => {
    const body = (anthropic: unknown) => ({
      runId: "run_1",
      agentId: "coder",
      providers: { anthropic },
      prices: {},
    });
    const keyed = { kind: "key", secret: "openrouter-key", baseUrl: "https://openrouter.ai/api" };

    it("takes a key's host pin, so Studio's bridge sends it too", () => {
      const access = {
        ...keyed,
        routing: { order: ["deepinfra/fp8"], allow_fallbacks: false, data_collection: "deny" },
      };
      expect(parse(openBridgeBody, body(access))).toEqual({ ok: true, value: body(access) });
    });

    it.each([
      ["a key OpenRouter's routing doesn't have", { sort: "price" }],
      ["a value of the wrong type", { allow_fallbacks: "no" }],
      ["data collection other than allow or deny", { data_collection: "some" }],
    ])("refuses %s", (_case, routing) => {
      expect(parse(openBridgeBody, body({ ...keyed, routing })).ok).toBe(false);
    });

    it("refuses a pin on the program's own sign-in", () => {
      const access = { kind: "sign-in", routing: { order: ["deepinfra/fp8"] } };
      expect(parse(openBridgeBody, body(access)).ok).toBe(false);
    });
  });
});

verifies("harness-bridge.host-fallback", () => {
  describe("openBridgeBody", () => {
    const body = (anthropic: unknown) => ({
      runId: "run_1",
      agentId: "coder",
      providers: { anthropic },
      prices: {},
    });
    const keyed = {
      kind: "key",
      secret: "openrouter-key",
      baseUrl: "https://openrouter.ai/api",
      alias: "fast",
      routing: { order: ["deepinfra/fp8"], data_collection: "deny" },
    };
    const hop = {
      alias: "fast-backup",
      routing: { order: ["acme-host/fp8"], data_collection: "deny" },
    };

    it("takes the alias and up to three fallback hops of a key", () => {
      const access = { ...keyed, fallbacks: [hop, hop, hop] };
      expect(parse(openBridgeBody, body(access))).toEqual({ ok: true, value: body(access) });
    });

    it.each([
      ["more than three hops", [hop, hop, hop, hop]],
      ["a hop with a model of its own", [{ ...hop, model: "acme/other" }]],
      ["a hop with a key of its own", [{ ...hop, secret: "other-key" }]],
      ["a hop with an address of its own", [{ ...hop, baseUrl: "https://models.acme.example" }]],
      ["a hop without a routing", [{ alias: "fast-backup" }]],
      ["a hop whose routing has another key", [{ ...hop, routing: { sort: "price" } }]],
    ])("refuses %s", (_case, fallbacks) => {
      expect(parse(openBridgeBody, body({ ...keyed, fallbacks })).ok).toBe(false);
    });

    it("refuses fallbacks on the program's own sign-in", () => {
      const access = { kind: "sign-in", fallbacks: [hop] };
      expect(parse(openBridgeBody, body(access)).ok).toBe(false);
    });
  });
});
