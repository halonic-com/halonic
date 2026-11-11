import { readdirSync, readFileSync } from "node:fs";
import type { IntegrationSheet } from "@halonicjs/format/integration";
import type { Integration, IntegrationTool, ProviderConfig } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { canary, fakeTransport, memoryTokens, secrets } from "./fake-transport.test-helper.ts";
import { type LoadIntegrationOptions, loadIntegration, providerChoices } from "./loader.ts";

/** The weather sheet as the build writes it: data, defaults left out. */
function sheet(): Record<string, unknown> {
  return {
    id: "weather",
    version: "1.0.0",
    kit: 1,
    provides: ["connector"],
    hosts: ["api.example.com"],
    secrets: {
      "weather-key": { purpose: "Reads the forecast.", hosts: ["api.example.com"], as: "bearer" },
    },
    tools: [
      {
        name: "forecast",
        description: "Today's forecast for a city.",
        arguments: { city: "The city." },
        risk: "read",
        untrusted: true,
      },
    ],
  };
}

function tool(): IntegrationTool {
  return {
    name: "forecast",
    description: "Today's forecast for a city.",
    parameters: {
      type: "object",
      properties: { city: { type: "string", description: "The city." } },
    },
    risk: "read",
    untrusted: true,
  };
}

function weather(tools: IntegrationTool[] = [tool()]): Integration {
  return {
    name: "weather",
    version: "1.0.0",
    tools,
    connect: () => ({ callTool: async () => "", close: async () => {} }),
  };
}

function load(overrides: Partial<LoadIntegrationOptions> = {}, data: unknown = sheet()) {
  const fake = fakeTransport();
  const loaded = loadIntegration({
    source: { origin: "built-in", sheet: data, integration: weather() },
    choices: { secretNames: { "weather-key": "example-key" } },
    transport: fake.transport,
    secrets,
    tokens: memoryTokens(),
    ...overrides,
  });
  return { loaded, sent: fake.sent };
}

function codes(result: ReturnType<typeof loadIntegration>) {
  return result.ok ? [] : result.error.map(({ code, path }) => ({ code, path }));
}

verifies("integration-kit.loader", () => {
  describe("a built-in integration", () => {
    it("loads, and places the workspace secret picked for the sheet's secret", async () => {
      const { loaded, sent } = load();
      if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
      expect(loaded.value.sheet.tokens).toEqual([]);
      await loaded.value.host.http.fetch("https://api.example.com/v1", {
        auth: { secret: "weather-key", as: "bearer" },
      });
      expect(sent[0]?.headers["authorization"]).toBe(`Bearer ${canary["example-key"]}`);
    });

    it("reads no secret the user didn't pick", async () => {
      const { loaded } = load({ choices: {} });
      if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
      await expect(
        loaded.value.host.http.fetch("https://api.example.com/v1", {
          auth: { secret: "weather-key", as: "bearer" },
        }),
      ).rejects.toMatchObject({ code: "secret-not-configured" });
    });

    it("refuses a pick for a secret the sheet doesn't declare", () => {
      const { loaded } = load({ choices: { secretNames: { "other-key": "example-key" } } });
      expect(codes(loaded)).toEqual([{ code: "secret-not-declared", path: ["secrets"] }]);
    });

    it("refuses a sheet that fails its schema, or another kit version", () => {
      expect(codes(load({}, { ...sheet(), network: "any" }).loaded)).toEqual([
        { code: "unrecognized_keys", path: [] },
      ]);
      expect(codes(load({}, { ...sheet(), kit: 2 }).loaded)).toEqual([
        { code: "kit-version", path: ["kit"] },
      ]);
    });
  });

  describe("code and sheet must match", () => {
    const differing: [string, Partial<IntegrationTool>][] = [
      ["risk", { risk: "write" }],
      ["description", { description: "Something else." }],
      ["untrusted", { untrusted: false }],
      ["arguments", { parameters: { type: "object", properties: { city: { type: "string" } } } }],
    ];
    it.each(differing)("refuses a tool whose %s differs", (field, change) => {
      const integration = weather([{ ...tool(), ...change }]);
      const { loaded } = load({ source: { origin: "built-in", sheet: sheet(), integration } });
      expect(codes(loaded)).toEqual([{ code: "tool-differs", path: ["tools", 0, field] }]);
    });

    it("refuses a tool only one side lists", () => {
      const extra = { ...tool(), name: "alerts" };
      const both = load({
        source: { origin: "built-in", sheet: sheet(), integration: weather([tool(), extra]) },
      });
      expect(codes(both.loaded)).toEqual([{ code: "tool-not-declared", path: ["tools"] }]);
      const none = load({
        source: { origin: "built-in", sheet: sheet(), integration: weather([]) },
      });
      expect(codes(none.loaded)).toEqual([{ code: "tool-not-offered", path: ["tools", 0] }]);
    });
  });

  describe("a local integration", () => {
    const local = (approvedSheet?: unknown) =>
      load({
        source: {
          origin: "local",
          sheet: sheet(),
          integration: weather(),
          ...(approvedSheet === undefined ? {} : { approvedSheet }),
        },
      }).loaded;

    it("loads only with the sheet the user approved", () => {
      expect(codes(local())).toEqual([{ code: "sheet-not-approved", path: [] }]);
      expect(local({ ...sheet(), tokens: [], needs: [] }).ok).toBe(true);
    });

    it("is refused when the sheet changed since it was approved", () => {
      const approved = { ...sheet(), hosts: ["api.example.com", "files.example.com"] };
      expect(codes(local(approved))).toEqual([{ code: "sheet-not-approved", path: [] }]);
    });

    it("is refused when its sheet declares tokens, which a built-in one may (A32)", () => {
      const withTokens = {
        ...sheet(),
        tokens: [{ name: "weather-refresh", purpose: "Keeps you signed in." }],
      };
      const integration = weather();
      const refused = load({
        source: { origin: "local", sheet: withTokens, integration, approvedSheet: withTokens },
      }).loaded;
      expect(codes(refused)).toEqual([{ code: "tokens-not-allowed", path: ["tokens"] }]);
      expect(refused.ok ? undefined : refused.error[0]?.fix).toBe(
        "Remove tokens from its sheet and use an API key, or ask for sign-in support.",
      );
      const builtIn = load({ source: { origin: "built-in", sheet: withTokens, integration } });
      expect(builtIn.loaded.ok).toBe(true);
    });
  });

  it("refuses a need this runtime doesn't offer", () => {
    const needs = { ...sheet(), needs: ["process"] };
    expect(codes(load({}, needs).loaded)).toEqual([
      { code: "need-not-available", path: ["needs", 0] },
    ]);
    expect(load({ capabilities: ["process"] }, needs).loaded.ok).toBe(true);
  });

  it("resolves a { fromSetting } host from the workspace's settings", async () => {
    const mcp = {
      ...sheet(),
      hosts: ["api.example.com", { fromSetting: "url", class: "loopback" }],
    };
    const settings = { url: "http://localhost:8080/mcp" };
    const { loaded, sent } = load({ choices: { settings } }, mcp);
    if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
    await loaded.value.host.http.fetch("http://localhost:8080/mcp");
    expect(sent.map((request) => request.url)).toEqual(["http://localhost:8080/mcp"]);
    expect(loaded.value.host.settings).toEqual(settings);
    expect(codes(load({}, mcp).loaded)).toEqual([{ code: "setting-missing", path: ["hosts", 1] }]);
  });

  it("gives the kit the sheet's limits", async () => {
    const { loaded } = load({}, { ...sheet(), limits: { maxResponseBytes: 1 } });
    if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
    const response = await loaded.value.host.http.fetch("https://api.example.com/v1");
    await expect(response.text()).rejects.toMatchObject({ code: "response-too-large" });
  });

  describe("a provider entry", () => {
    const config: ProviderConfig = {
      id: "office",
      type: "ollama",
      baseUrl: "http://localhost:11434",
      secret: "office-key",
      local: true,
      options: {},
    };
    const parsed = (data: Record<string, unknown>) =>
      ({ tokens: [], tools: [], needs: [], ...data }) as unknown as IntegrationSheet;
    const ollama = parsed({
      ...sheet(),
      hosts: [{ fromSetting: "url", class: "loopback" }],
      secrets: { "server-key": { purpose: "x", hosts: [{ fromSetting: "url" }], as: "bearer" } },
    });

    it("maps baseUrl onto the { fromSetting } host and its secret onto the sheet's", () => {
      expect(providerChoices(ollama, config)).toEqual({
        ok: true,
        value: {
          settings: { url: "http://localhost:11434" },
          secretNames: { "server-key": "office-key" },
        },
      });
    });

    it("refuses a baseUrl or a secret it can't map", () => {
      const fixed = parsed({
        ...sheet(),
        secrets: {
          a: { purpose: "x", hosts: ["api.example.com"], as: "bearer" },
          b: { purpose: "x", hosts: ["api.example.com"], as: "bearer" },
        },
      });
      const result = providerChoices(fixed, config);
      expect(result.ok ? [] : result.error.map((problem) => problem.code)).toEqual([
        "base-url-not-mapped",
        "secret-not-mapped",
      ]);
    });
  });
});

verifies("integration-kit.loader", () => {
  it("reads the sheet only through @halonicjs/format/integration, which loads no yaml", () => {
    const folder = new URL("./", import.meta.url);
    const sources = readdirSync(folder)
      .filter((file) => file.endsWith(".ts") && !file.includes(".test"))
      .map((file) => readFileSync(new URL(file, folder), "utf8"));
    const formatImports = sources.flatMap((source) =>
      [...source.matchAll(/from "(@halonicjs\/format[^"]*)"/g)].map((match) => match[1]),
    );
    expect(new Set(formatImports)).toEqual(new Set(["@halonicjs/format/integration"]));
  });
});

verifies("ports.workspace-secrets", () => {
  it.each(["token-key", "Serve_Password", "HALONIC-TOKEN-google_refresh"])(
    "refuses the pick %s, one of Halonic's own names, and sends nothing",
    async (picked) => {
      const { loaded, sent } = load({ choices: { secretNames: { "weather-key": picked } } });
      if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
      await expect(
        loaded.value.host.http.fetch("https://api.example.com/v1", {
          auth: { secret: "weather-key", as: "bearer" },
        }),
      ).rejects.toThrow(new RangeError("A workspace can't pick a secret that belongs to Halonic."));
      expect(sent).toEqual([]);
    },
  );
});
