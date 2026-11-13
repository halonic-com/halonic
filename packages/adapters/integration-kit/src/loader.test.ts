import { readdirSync, readFileSync } from "node:fs";
import type { IntegrationSheet } from "@halonicjs/format/integration";
import type { Integration, IntegrationTool, ProviderConfig } from "@halonicjs/ports";
import type { Result } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { canary, fakeTransport, memoryTokens, secrets } from "./fake-transport.test-helper.ts";
import type { LoadProblem } from "./load-problem.ts";
import {
  type LoadIntegrationOptions,
  loadIntegration,
  prepareIntegration,
  providerChoices,
  type WorkspaceChoices,
} from "./loader.ts";

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

function codes(result: Result<unknown, readonly LoadProblem[]>) {
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

    it("loads a sheet built for an older kit, and says a newer one needs a newer Halonic", () => {
      expect(load({}, { ...sheet(), kit: 1 }).loaded.ok).toBe(true);
      expect(load({}, { ...sheet(), kit: 2 }).loaded.ok).toBe(true);
      const { loaded } = load({}, { ...sheet(), kit: 3 });
      expect(loaded.ok ? [] : loaded.error.map((problem) => problem.message)).toEqual([
        "weather: this integration needs a newer version of Halonic (it is built against kit 3, and this Halonic offers kit 2)",
      ]);
    });

    it("refuses a sheet that fails its schema, or a kit newer than this Halonic's", () => {
      expect(codes(load({}, { ...sheet(), network: "any" }).loaded)).toEqual([
        { code: "unrecognized_keys", path: [] },
      ]);
      expect(codes(load({}, { ...sheet(), kit: 3 }).loaded)).toEqual([
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

  describe("a sign-in in a local integration", () => {
    it("is refused until the trust content shows it, which a built-in one may declare", () => {
      const withSignIn = {
        ...sheet(),
        kit: 2,
        signIns: {
          "example-account": {
            purpose: "Access to your Example account.",
            flow: "oauth-code",
            authorizeUrl: "https://auth.example.com/authorize",
            tokenUrl: "https://auth.example.com/token",
            clientId: "example-app-id",
            access: { hosts: ["api.example.com"], as: "bearer" },
          },
        },
      };
      const integration = weather();
      const refused = load({
        source: { origin: "local", sheet: withSignIn, integration, approvedSheet: withSignIn },
      }).loaded;
      expect(codes(refused)).toEqual([
        { code: "sign-ins-not-allowed", path: ["signIns", "example-account"] },
      ]);
      expect(refused.ok ? undefined : refused.error[0]?.fix).toBe(
        "Remove signIns from its sheet and use an API key, or ask for sign-in support.",
      );
      const builtIn = load({ source: { origin: "built-in", sheet: withSignIn, integration } });
      expect(builtIn.loaded.ok).toBe(true);
    });
  });

  describe("prepared without its code, as the runner needs it", () => {
    const prepare = (
      choices: WorkspaceChoices,
      data = sheet(),
      origin: "built-in" | "local" = "local",
    ) =>
      prepareIntegration({
        source:
          origin === "local"
            ? { origin, sheet: data, approvedSheet: data }
            : { origin, sheet: data },
        choices,
        transport: fakeTransport().transport,
        secrets,
        tokens: memoryTokens(),
      });

    it("checks the sheet and builds the host, but no code", async () => {
      const prepared = prepare({ secretNames: { "weather-key": "example-key" } });
      if (!prepared.ok) expect.fail(JSON.stringify(prepared.error));
      expect(prepared.value.sheet.id).toBe("weather");
      expect(prepared.value).not.toHaveProperty("integration");
      expect(await prepared.value.readSecrets()).toEqual([
        {
          value: canary["example-key"],
          placements: [{ secret: "weather-key", as: "bearer" }],
        },
      ]);
    });

    it("reads a sign-in's client secret for the filter, with no placement: the code can't place it", async () => {
      const signIns = {
        kit: 2,
        secrets: { "example-client": { purpose: "The client secret of your Example app." } },
        signIns: {
          "example-account": {
            purpose: "Access to your Example account.",
            flow: "oauth-code",
            authorizeUrl: "https://auth.example.com/authorize",
            tokenUrl: "https://auth.example.com/token",
            clientId: "example-app-id",
            clientSecret: "example-client",
            access: { hosts: ["api.example.com"], as: "bearer" },
          },
        },
      };
      const prepared = prepare(
        { secretNames: { "example-client": "example-key" } },
        {
          ...sheet(),
          ...signIns,
        },
        "built-in",
      );
      if (!prepared.ok) expect.fail(JSON.stringify(prepared.error));
      expect(await prepared.value.readSecrets()).toEqual([
        { value: canary["example-key"], placements: [] },
      ]);
    });

    it("refuses to read a picked secret shorter than 8 bytes", async () => {
      const prepared = prepareIntegration({
        source: { origin: "local", sheet: sheet(), approvedSheet: sheet() },
        choices: { secretNames: { "weather-key": "example-key" } },
        transport: fakeTransport().transport,
        secrets: { get: async () => "short" },
        tokens: memoryTokens(),
      });
      if (!prepared.ok) expect.fail(JSON.stringify(prepared.error));
      await expect(prepared.value.readSecrets()).rejects.toMatchObject({
        code: "secret-too-short",
      });
    });

    it("reads no secret the user didn't pick", async () => {
      const prepared = prepare({});
      if (!prepared.ok) expect.fail(JSON.stringify(prepared.error));
      expect(await prepared.value.readSecrets()).toEqual([]);
    });

    it("refuses what loading refuses apart from the code, such as tokens", () => {
      const withTokens = { ...sheet(), tokens: [{ name: "refresh", purpose: "Stays signed in." }] };
      expect(codes(prepare({}, withTokens))).toEqual([
        { code: "tokens-not-allowed", path: ["tokens"] },
      ]);
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

verifies("integration-kit.plugin-secrets", () => {
  describe("a plugin's backend", () => {
    const ownValue = canary["example-key"];

    /** The weather sheet loaded as a plugin's backend; a plugin's id is the sheet's. */
    function loadPlugin(secretName: string, stored: Record<string, string>) {
      const fake = fakeTransport();
      const loaded = prepareIntegration({
        source: { origin: "local", sheet: sheet(), approvedSheet: sheet(), plugin: true },
        choices: { secretNames: { "weather-key": secretName } },
        transport: fake.transport,
        secrets: { get: async (name) => stored[name] ?? null },
        tokens: memoryTokens(),
      });
      if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
      return { loaded: loaded.value, sent: fake.sent };
    }

    it("reads the secret stored for the plugin, which a workspace's picks can't name", async () => {
      const { loaded } = loadPlugin("plugin__weather__weather-key", {
        "plugin__weather__weather-key": ownValue,
      });
      expect((await loaded.readSecrets()).map((secret) => secret.value)).toEqual([ownValue]);
    });

    it.each(["openai-key", "token-key", "plugin__rain__weather-key"])(
      "refuses the pick %s, which isn't one of the plugin's, and reads nothing",
      async (picked) => {
        const { loaded } = loadPlugin(picked, { [picked]: ownValue });
        await expect(loaded.readSecrets()).rejects.toThrow(
          new RangeError("A plugin can read only the secrets stored for it."),
        );
      },
    );
  });
});
