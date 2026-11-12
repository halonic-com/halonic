import type { AddressCheckingHttpClient } from "@halonicjs/adapter-integration-kit";
import { type Plugin, parseFile } from "@halonicjs/format";
import type { HttpClient, IntegrationTool, TokenStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { IntegrationDeclaration } from "../frames.ts";
import { fakeSecret } from "../pipes.test-helper.ts";
import type { RunnerConnection } from "./connect-runner.ts";
import type { FolderEntry, IntegrationFolderDisk } from "./integration-folder.ts";
import type { LocalRunnerBridge } from "./local-integration.ts";
import { type LoadPluginBackendOptions, loadPluginBackend } from "./plugin-backend.ts";

const manifest = `id: weather
version: 1.2.0
sdk: 1
name: Weather
description: Forecasts for the places you name.
backend:
  hosts: [api.example.com]
  secrets:
    weather-key:
      purpose: The forecast service's API key
      hosts: [api.example.com]
      as: bearer
  tools:
    - name: forecast
      description: The forecast for one place.
      arguments: { city: The city. }
      risk: read
      untrusted: true
ui:
  settings:
    units: { label: Units, type: text, default: metric }
    key: { label: Key, type: secret, secret: weather-key }
`;

const toolsOnlyManifest = `id: files-only
version: 1.0.0
sdk: 1
name: Files only
description: A local tool and nothing else.
localTools:
  - id: files
    start:
      package: { runner: npx, name: "@acme/files-mcp", version: 3.1.4 }
    tools:
      - { name: list-files, description: Lists the files in a folder., risk: read, untrusted: true }
`;

function pluginFrom(text: string): Plugin {
  const parsed = parseFile("plugin", text);
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return parsed.value.value;
}

function forecastTool(risk: "read" | "write" = "read"): IntegrationTool {
  return {
    name: "forecast",
    description: "The forecast for one place.",
    parameters: {
      type: "object",
      properties: { city: { type: "string", description: "The city." } },
      required: ["city"],
    },
    risk,
    untrusted: true,
  };
}

function declaration(tool: IntegrationTool = forecastTool()): IntegrationDeclaration {
  return { name: "weather", version: "1.2.0", tools: [tool] };
}

/** A started runner that answers every call, and records whether it was closed. */
function fakeRunner(
  declared: IntegrationDeclaration,
): RunnerConnection & { closed: () => boolean } {
  let closed = false;
  return {
    declaration: declared,
    stopped: new Promise(() => {}),
    callTool: async (name, args) => `${name} ${JSON.stringify(args)}`,
    close: async () => {
      closed = true;
    },
    closed: () => closed,
  };
}

function disk(entries: FolderEntry[], links: Record<string, string> = {}): IntegrationFolderDisk {
  return {
    entries: (folder) => {
      if (folder !== "/plugins/weather") throw new Error(`no folder ${folder}`);
      return entries;
    },
    realPath: (path) => {
      if (path === "/plugins/weather") return path;
      const target = links[path];
      if (target === undefined) throw new Error(`no such path ${path}`);
      return target;
    },
    identity: (file) => ({ id: file, names: 1 }),
  };
}

const tidyFolder = disk([{ name: "plugin.yaml", kind: "file" }]);

const emptyTokens: TokenStore = {
  get: async () => null,
  set: async () => {},
  remove: async () => {},
};

// Answers without a network, so there is no address to check.
const offlineTransport: HttpClient = { fetch: async () => new Response("{}") };

async function load(
  runner: ReturnType<typeof fakeRunner> | undefined,
  overrides: Partial<LoadPluginBackendOptions> = {},
) {
  const starts: LocalRunnerBridge[] = [];
  const loaded = await loadPluginBackend({
    plugin: pluginFrom(manifest),
    folder: "/plugins/weather",
    folderDisk: tidyFolder,
    choices: {
      settings: { units: "metric" },
      secretNames: { "weather-key": "plugin__weather__weather-key" },
    },
    transport: offlineTransport as AddressCheckingHttpClient,
    secrets: { get: async (name) => (name === "plugin__weather__weather-key" ? fakeSecret : null) },
    tokens: emptyTokens,
    start: async (bridge) => {
      starts.push(bridge);
      if (runner === undefined) throw new Error("no runner to start");
      return runner;
    },
    ...overrides,
  });
  return { loaded, starts };
}

verifies("integration-runner.plugin-backend", () => {
  describe("loadPluginBackend", () => {
    it("starts one runner for the manifest's backend and offers what it declared", async () => {
      const runner = fakeRunner(declaration());
      const { loaded, starts } = await load(runner);
      if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
      const { integration, host, sheet } = loaded.value;
      expect(sheet).toMatchObject({ id: "weather", version: "1.2.0", kit: 1 });
      expect(integration.tools).toEqual([forecastTool()]);
      expect(starts).toHaveLength(1);
      expect(starts[0]?.http).toBe(host.http);
      expect(starts[0]?.tools).toEqual(["forecast"]);
      expect(starts[0]?.secrets.texts).toContain(`Bearer ${fakeSecret}`);
      const connection = integration.connect(host);
      expect(await connection.callTool("forecast", { city: "Ghent" })).toBe(
        'forecast {"city":"Ghent"}',
      );
      await connection.close();
      expect(runner.closed()).toBe(true);
    });

    it("gives the host the plain setting values and never a secret's value", async () => {
      const { loaded, starts } = await load(fakeRunner(declaration()));
      if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
      expect(starts[0]?.settings).toEqual({ units: "metric" });
      expect(JSON.stringify(starts[0]?.settings)).not.toContain(fakeSecret);
      expect(JSON.stringify(loaded.value.host.settings)).not.toContain(fakeSecret);
    });

    it("starts nothing when the backend declares tokens, so no token value enters the runner", async () => {
      const plugin = pluginFrom(manifest);
      const withTokens: Plugin = {
        ...plugin,
        backend: plugin.backend && {
          ...plugin.backend,
          tokens: [{ name: "refresh", purpose: "Stays signed in." }],
        },
      };
      const { loaded, starts } = await load(undefined, { plugin: withTokens });
      expect(loaded.ok ? [] : loaded.error.map((problem) => problem.code)).toEqual([
        "tokens-not-allowed",
      ]);
      expect(starts).toEqual([]);
    });

    it("starts nothing for a plugin without a backend", async () => {
      const { loaded, starts } = await load(undefined, { plugin: pluginFrom(toolsOnlyManifest) });
      expect(loaded.ok ? [] : loaded.error.map((problem) => problem.code)).toEqual(["no-backend"]);
      expect(starts).toEqual([]);
    });

    it("starts nothing when a link in the plugin's folder leads out of it", async () => {
      const linked = disk([{ name: "keys", kind: "link" }], {
        "/plugins/weather/keys": "/elsewhere/keys",
      });
      const { loaded, starts } = await load(undefined, { folderDisk: linked });
      expect(loaded.ok ? [] : loaded.error.map((problem) => problem.code)).toEqual([
        "link-out-of-folder",
      ]);
      expect(starts).toEqual([]);
    });

    it("stops the runner and offers nothing when the code declares other than the manifest", async () => {
      const runner = fakeRunner(declaration(forecastTool("write")));
      const { loaded } = await load(runner);
      expect(loaded.ok ? [] : loaded.error.map(({ code, path }) => ({ code, path }))).toEqual([
        { code: "tool-differs", path: ["tools", 0, "risk"] },
      ]);
      expect(runner.closed()).toBe(true);
    });

    it("passes on what start throws, such as a plugin nobody trusted", async () => {
      const untrusted = new Error("the plugin isn't trusted");
      await expect(
        load(undefined, {
          start: async () => {
            throw untrusted;
          },
        }),
      ).rejects.toBe(untrusted);
    });

    it("limits the host's requests to the hosts the sheet declares", async () => {
      const { loaded } = await load(fakeRunner(declaration()));
      if (!loaded.ok) expect.fail(JSON.stringify(loaded.error));
      await expect(loaded.value.host.http.fetch("https://evil.example.org/")).rejects.toThrow();
    });
  });
});
