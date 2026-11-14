import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import type { StartedRunner } from "@halonicjs/adapter-integration-runner";
import {
  MemorySecrets,
  MemoryTokenStore,
  MemoryTrustStore,
  MemoryUnfencedRunConsentStore,
} from "@halonicjs/adapter-memory";
import { RunnerStartGate, readPluginFolder, UnfencedRuns } from "@halonicjs/app";
import type {
  ConnectorFactoryContext,
  IntegrationTool,
  Sandbox,
  SandboxCheck,
} from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openPluginBackend } from "./open-plugin-backend.ts";
import { PluginConnectorFactory } from "./plugin-connector-factory.ts";
import { removeTestFolder } from "./test/remove-folder.ts";
import { webCryptoDigest } from "./workspace-runs.ts";
import { cliTrustService } from "./workspace-trust.ts";

const clock = fixedClock(Date.UTC(2026, 10, 14, 9));
const passes: SandboxCheck = { ok: true, reason: null, missing: [] };
const onWindows: SandboxCheck = { ok: false, reason: "windows", missing: [] };

const manifest = `id: weather
version: 1.2.0
sdk: 1
name: Weather
backend:
  hosts: [api.weather.example]
  tools:
    - { name: get-forecast, description: The forecast., risk: read, untrusted: true }
`;

const getForecast: IntegrationTool = {
  name: "get-forecast",
  description: "The forecast.",
  parameters: { type: "object", properties: {} },
  risk: "read",
  untrusted: true,
};

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "halonic-cli-open-plugin-"));
  await put({
    "weather/plugin.yaml": manifest,
    "weather/backend/index.js": "export default {};\n",
  });
});

afterEach(async () => {
  await removeTestFolder(root);
});

async function put(files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

/** A sandbox the gate only checks; the runner's start is faked. */
function sandbox(check: SandboxCheck, afterTrust?: () => Promise<void>): Sandbox {
  return {
    check: async () => {
      await afterTrust?.();
      return check;
    },
    capabilities: () => ({ files: "shared", strength: "os" }),
    open: async () => {
      throw new Error("the fake start never opens a session");
    },
  };
}

const runnerMachine = {
  homeFolder: "home-folder",
  socketFolders: [],
  systemFiles: [],
  sandboxFolders: [],
  tempFolder: "temp-folder",
  timeLimitMs: 1000,
};

/** Everything the opener uses, with a runner that answers and counts its starts and stops. */
async function setup(
  options: {
    check?: SandboxCheck;
    runnerBuilt?: boolean;
    trusted?: boolean;
    secrets?: Record<string, string>;
    /** Runs once the trust check has passed, while the gate checks the sandbox. */
    afterTrust?: () => Promise<void>;
    /** Runs at the first start, before the trust check's second read. */
    beforeStart?: () => Promise<void>;
  } = {},
) {
  const { check = passes, runnerBuilt = true, trusted = true, secrets = {} } = options;
  const plugins = new FileSystemFolderReader(root, root);
  const trust = cliTrustService(new MemoryTrustStore(), clock);
  /** Trusts the plugin as its folder is now. */
  const trustNow = async () => {
    const read = await readPluginFolder(plugins, webCryptoDigest, "weather");
    if (!read.ok) throw new Error("the fixture plugin must read");
    const shown = await trust.checkPlugin(read.value);
    await trust.grantPlugin(read.value, shown.fingerprint, "cli");
  };
  if (trusted) await trustNow();
  const seen = {
    starts: 0,
    stops: 0,
    entries: [] as string[],
    settings: [] as unknown[],
    secretTexts: [] as (readonly string[])[],
  };
  const open = openPluginBackend({
    plugins,
    digest: webCryptoDigest,
    trust,
    gate: new RunnerStartGate({
      platform: "linux",
      fenced: sandbox(check, options.afterTrust),
      launcher: sandbox(check),
      runs: new UnfencedRuns({ store: new MemoryUnfencedRunConsentStore(), clock }),
    }),
    runtime: { node: "/node/bin/node", nodeFolder: "/node", runnerFile: "/runner/runner.mjs" },
    transport: { fetch: async () => new Response("{}") } as never,
    settings: async () => ({ units: "metric" }),
    runnerMachine: async () => {
      await options.beforeStart?.();
      return runnerMachine;
    },
    runnerExists: () => runnerBuilt,
    startRunner: async (start) => {
      seen.starts += 1;
      seen.entries.push(`${start.entry.file}#${start.entry.exportName}`);
      seen.settings.push(start.settings);
      seen.secretTexts.push(start.secrets().texts);
      const runner: StartedRunner = {
        fence: { state: "fenced" },
        declaration: { name: "weather", version: "1.2.0", tools: [getForecast] },
        stopped: new Promise(() => {}),
        callTool: async (name) => `answer from ${name}`,
        close: async () => {
          seen.stops += 1;
        },
      };
      return runner;
    },
  });
  const context = {
    secrets: new MemorySecrets(secrets),
    tokens: new MemoryTokenStore(),
    workspaceRoot: root,
    trust: null,
  } as unknown as ConnectorFactoryContext;
  const factory = new PluginConnectorFactory(open);
  const client = () =>
    factory.create(
      { id: "weather", transport: { kind: "plugin", id: "weather" }, secretEnv: {} },
      context,
    );
  return { seen, client, trustNow };
}

verifies("cli.open-plugin-backend", () => {
  describe("openPluginBackend", () => {
    it("starts the runner from the plugin's entry with the default export and its settings, and calls its tool", async () => {
      const { seen, client } = await setup();
      const opened = client();
      expect(await opened.callTool("get-forecast", {})).toBe("answer from get-forecast");
      expect(seen.entries[0]).toMatch(/weather[\\/]backend[\\/]index\.js#default$/u);
      expect(seen.settings).toEqual([{ units: "metric" }]);
      await opened.close();
      expect(seen.stops).toBe(1);
    });

    it("refuses a plugin nobody trusted, and starts no runner", async () => {
      const { seen, client } = await setup({ trusted: false });
      await expect(client().callTool("get-forecast", {})).rejects.toThrow(
        /Connector "weather" didn't start: .*halonic trust --plugin weather/,
      );
      expect(seen.starts).toBe(0);
    });

    it("refuses a plugin whose file changed after it was trusted, and starts no runner", async () => {
      const { seen, client } = await setup();
      await put({ "weather/backend/index.js": "export default { changed: true };\n" });
      await expect(client().callTool("get-forecast", {})).rejects.toThrow(
        /Connector "weather" didn't start: .*changed since you trusted it/,
      );
      expect(seen.starts).toBe(0);
    });

    it("checks the plugin again at a later start, so a file edited between two starts is refused", async () => {
      const { seen, client } = await setup();
      const first = client();
      await first.callTool("get-forecast", {});
      await first.close();
      await put({ "weather/backend/index.js": "export default { edited: true };\n" });
      await expect(client().callTool("get-forecast", {})).rejects.toThrow(/didn't start/);
      expect(seen.starts).toBe(1);
    });

    it("refuses a start when only the manifest changed after the loader read it and was trusted again, and says to start the run again", async () => {
      let trustNow: () => Promise<void> = async () => {};
      const opened = await setup({
        beforeStart: async () => {
          await put({
            "weather/plugin.yaml": manifest.replace("api.weather.example", "api.other.example"),
          });
          await trustNow();
        },
      });
      trustNow = opened.trustNow;
      await expect(opened.client().callTool("get-forecast", {})).rejects.toThrow(
        /Start the run again/,
      );
      expect(opened.seen.starts).toBe(0);
    });

    it("refuses a start when a file changes after the trust check and before the runner starts", async () => {
      const { seen, client } = await setup({
        afterTrust: async () => {
          await put({ "weather/backend/index.js": "export default { swapped: true };\n" });
        },
      });
      await expect(client().callTool("get-forecast", {})).rejects.toThrow(
        /didn't start: .*changed since you trusted it/,
      );
      expect(seen.starts).toBe(0);
    });

    it("gives the runner the plugin's secrets, read from where the plugin's secrets are stored", async () => {
      const secretValue = "weather-key-value-1234";
      await put({
        "weather/plugin.yaml": manifest.replace(
          "  tools:",
          `  secrets:
    weather-key:
      purpose: The forecast API key
      hosts: [api.weather.example]
      as: bearer
  tools:`,
        ),
      });
      const { seen, client } = await setup({
        secrets: { "plugin__weather__weather-key": secretValue },
      });
      await client().callTool("get-forecast", {});
      expect(seen.secretTexts[0]).toContain(secretValue);
    });

    it("refuses when the sandbox isn't there and running without it isn't allowed (Windows)", async () => {
      const { seen, client } = await setup({ check: onWindows });
      await expect(client().callTool("get-forecast", {})).rejects.toThrow(
        /Connector "weather" didn't start: the sandbox isn't available here \(windows\)/,
      );
      expect(seen.starts).toBe(0);
    });

    it("refuses when the integration runner isn't built, and starts no runner", async () => {
      const { seen, client } = await setup({ runnerBuilt: false });
      await expect(client().callTool("get-forecast", {})).rejects.toThrow(
        "Connector \"weather\" didn't start: the integration runner isn't built",
      );
      expect(seen.starts).toBe(0);
    });
  });
});

verifies("cli.plugin-connector-factory", () => {
  describe("PluginConnectorFactory", () => {
    it("starts no runner for a connector the run holds and never calls, and stops the one that started", async () => {
      const { seen, client } = await setup();
      const idle = client();
      await idle.close();
      expect(seen.starts).toBe(0);
      const used = client();
      await used.callTool("get-forecast", {});
      await used.close();
      expect(seen.starts).toBe(1);
      expect(seen.stops).toBe(1);
    });

    it("tries again after a refused start", async () => {
      const { seen, client } = await setup();
      const opened = client();
      await put({ "weather/backend/index.js": "export default { changed: true };\n" });
      await expect(opened.callTool("get-forecast", {})).rejects.toThrow(/didn't start/);
      await put({ "weather/backend/index.js": "export default {};\n" });
      expect(await opened.callTool("get-forecast", {})).toBe("answer from get-forecast");
      expect(seen.starts).toBe(1);
    });
  });
});
