import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import {
  type PluginBackendMachine,
  RunnerToolError,
  type StartedRunner,
} from "@halonicjs/adapter-integration-runner";
import {
  MemorySecrets,
  MemoryTokenStore,
  MemoryTrustStore,
  MemoryUnfencedRunConsentStore,
} from "@halonicjs/adapter-memory";
import { RunnerStartGate, readPluginFolder, TrustService, UnfencedRuns } from "@halonicjs/app";
import type { FolderReader, Sandbox, SandboxCheck, SignInTokens } from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type HostPluginContext,
  hostPluginBackends,
  unavailablePluginBackends,
} from "./host-plugin-backends.ts";
import { PluginRefusal } from "./plugin-refusal.ts";
import { pluginSignIns } from "./plugin-sign-ins.ts";

/** These tests never take a yes back in another process and no start hangs, so no timer goes off. */
const idleTimers = { set: () => undefined, clear: () => undefined };

const clock = fixedClock(Date.UTC(2026, 10, 14, 9));
const passes: SandboxCheck = { ok: true, reason: null, missing: [] };
const onWindows: SandboxCheck = { ok: false, reason: "windows", missing: [] };

const manifest = `id: acme
version: 1.0.0
sdk: 1
name: Acme
backend:
  hosts: [api.acme.example]
  secrets:
    acme-key: { purpose: Reads your Acme account, hosts: [api.acme.example], as: bearer }
  tools:
    - { name: echo, description: Echoes., risk: read, untrusted: true }
`;

const digest = {
  async sha256(data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "halonic-host-plugin-"));
  await put({ "acme/plugin.yaml": manifest, "acme/backend/index.js": "export default {};\n" });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
});

async function put(files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

function sandbox(check: SandboxCheck): Sandbox {
  return {
    check: async () => check,
    capabilities: () => ({ files: "shared", strength: "os" }),
    open: async () => {
      throw new Error("the fake start never opens a session");
    },
  };
}

/** The host's machine over a folder in the temp folder, with a runner that answers, and the folders read. */
async function setup(
  options: {
    check?: SandboxCheck;
    trusted?: boolean;
    platform?: NodeJS.Platform;
    /** The user's saved yes for running without the sandbox, for this reason. */
    allowed?: "windows";
    /** The plugin's saved setting values. */
    settings?: Record<string, string>;
  } = {},
) {
  const { check = passes, trusted = true, platform = "linux" } = options;
  const consent = new MemoryUnfencedRunConsentStore();
  if (options.allowed !== undefined) {
    await consent.save({ reason: options.allowed, allowedAt: clock.now().toISOString() });
  }
  const launcher = sandbox(passes);
  const folders = new FileSystemFolderReader(root, root);
  const readNames: string[] = [];
  const plugins: FolderReader = {
    location: folders.location,
    entries: async (dir, options) => {
      readNames.push(String(dir));
      return await folders.entries(dir, options);
    },
    read: async (path) => {
      readNames.push(path);
      return await folders.read(path);
    },
    locationOf: async (path) => await folders.locationOf(path),
  };
  const trust = new TrustService({
    store: new MemoryTrustStore(),
    digest,
    clock,
    appVersion: "0.0.0",
  });
  if (trusted) {
    const read = await readPluginFolder(folders, digest, "acme");
    if (!read.ok) throw new Error("the fixture plugin must read");
    const shown = await trust.checkPlugin(read.value);
    await trust.grantPlugin(read.value, shown.fingerprint, "cli");
  }
  const seen = { starts: 0, stops: 0 };
  const launched = { inLauncher: 0 };
  const machine: PluginBackendMachine = {
    plugins,
    digest,
    trust,
    gate: new RunnerStartGate({
      platform,
      fenced: sandbox(check),
      // Reached only with the user's saved yes for the reason at the start.
      launcher,
      runs: new UnfencedRuns({ store: consent, clock, timers: idleTimers }),
      timers: idleTimers,
    }),
    runtime: { node: "/host/halonic-agent-host", nodeFolder: "/host", runnerFile: "/r/runner.mjs" },
    transport: { fetch: async () => new Response("{}") } as never,
    settings: async () => options.settings ?? {},
    runnerMachine: async () => ({
      homeFolder: "home-folder",
      socketFolders: [],
      systemFiles: [],
      sandboxFolders: [],
      tempFolder: "temp-folder",
      timeLimitMs: 1000,
    }),
    runnerExists: () => true,
    startRunner: async (startOptions) => {
      seen.starts += 1;
      const inLauncher = startOptions.sandbox === launcher;
      if (inLauncher) launched.inLauncher += 1;
      const runner: StartedRunner = {
        fence: inLauncher ? { state: "off" } : { state: "fenced" },
        declaration: {
          name: "acme",
          version: "1.0.0",
          tools: [
            {
              name: "echo",
              description: "Echoes.",
              parameters: { type: "object", properties: {} },
              risk: "read",
              untrusted: true,
            },
          ],
        },
        stopped: new Promise(() => {}),
        callTool: async (name) => `answer from ${name}`,
        close: async () => {
          seen.stops += 1;
        },
      };
      return runner;
    },
  };
  /** The plugins whose sign-in tokens a backend's start asked for. */
  const signInAsks: string[] = [];
  const context = {
    secrets: new MemorySecrets({}),
    tokens: new MemoryTokenStore(),
    signInTokens: (plugin: string): SignInTokens | undefined => {
      signInAsks.push(plugin);
      return undefined;
    },
    trust: null,
  } as unknown as HostPluginContext;
  const logged: string[] = [];
  const backends = hostPluginBackends(machine, context, (text) => logged.push(text));
  return { backends, machine, seen, launched, readNames, logged, signInAsks };
}

async function refusedWith(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  return error instanceof PluginRefusal ? error.code : undefined;
}

verifies("agent-host.plugin-routes", () => {
  describe("the shipped executable's backends", () => {
    it("refuse every call as not in this build and start nothing", async () => {
      const backends = unavailablePluginBackends();
      await expect(backends.trustedFingerprint("acme")).rejects.toMatchObject({
        code: "not_in_this_build",
      });
      await expect(backends.trustedSecretNames("acme")).rejects.toMatchObject({
        code: "not_in_this_build",
      });
      await expect(backends.open("acme", "f")).rejects.toBeInstanceOf(PluginRefusal);
    });
  });

  describe("the host's plugin backends", () => {
    it("starts a trusted plugin's backend in the runner and calls its tool", async () => {
      const { backends, seen } = await setup();
      const fingerprint = await backends.trustedFingerprint("acme");
      const client = await backends.open("acme", fingerprint);
      expect(await client.callTool("echo", {})).toBe("answer from echo");
      await client.close();
      expect(seen).toEqual({ starts: 1, stops: 1 });
    });

    it("refuses a plugin nobody trusted, and starts nothing", async () => {
      const { backends, seen } = await setup({ trusted: false });
      expect(await refusedWith(backends.trustedFingerprint("acme"))).toBe("plugin_not_trusted");
      expect(seen.starts).toBe(0);
    });

    it("refuses a plugin that isn't in the plugins folder", async () => {
      const { backends } = await setup();
      expect(await refusedWith(backends.trustedFingerprint("absent"))).toBe("plugin_not_trusted");
    });

    it("refuses a plugin whose file changed after it was trusted", async () => {
      const { backends, seen } = await setup();
      await put({ "acme/backend/index.js": "export default { changed: true };\n" });
      expect(await refusedWith(backends.trustedFingerprint("acme"))).toBe("plugin_not_trusted");
      expect(seen.starts).toBe(0);
    });

    it("refuses the start when the plugin changed after the fingerprint was checked", async () => {
      const { backends, seen } = await setup();
      const fingerprint = await backends.trustedFingerprint("acme");
      await put({ "acme/backend/index.js": "export default { swapped: true };\n" });
      expect(await refusedWith(backends.open("acme", fingerprint))).toBe("plugin_not_trusted");
      expect(seen.starts).toBe(0);
    });

    it("refuses the start for a fingerprint the folder never had", async () => {
      const { backends, seen } = await setup();
      expect(await refusedWith(backends.open("acme", "hfp1:other"))).toBe("plugin_not_trusted");
      expect(seen.starts).toBe(0);
    });

    it("answers not_fenced and starts nothing where the sandbox fails its check", async () => {
      const { backends, seen, logged } = await setup({ check: onWindows });
      const fingerprint = await backends.trustedFingerprint("acme");
      expect(await refusedWith(backends.open("acme", fingerprint))).toBe("not_fenced");
      expect(seen.starts).toBe(0);
      expect(logged.join("")).toContain("windows");
    });

    it("answers not_fenced on Windows even when the sandbox passes its check, as the host wires no MXC", async () => {
      const { backends, seen } = await setup({ platform: "win32" });
      const fingerprint = await backends.trustedFingerprint("acme");
      expect(await refusedWith(backends.open("acme", fingerprint))).toBe("not_fenced");
      expect(seen.starts).toBe(0);
    });

    it("starts without the sandbox only with the user's saved yes for the reason at this start", async () => {
      const { backends, seen, launched } = await setup({ platform: "win32", allowed: "windows" });
      const fingerprint = await backends.trustedFingerprint("acme");
      const client = await backends.open("acme", fingerprint);
      expect(seen.starts).toBe(1);
      expect(launched.inLauncher).toBe(1);
      await client.close();
    });

    it("starts nothing with a saved yes for another reason", async () => {
      const { backends, seen } = await setup({
        check: { ...onWindows, reason: "container" },
        allowed: "windows",
      });
      const fingerprint = await backends.trustedFingerprint("acme");
      expect(await refusedWith(backends.open("acme", fingerprint))).toBe("not_fenced");
      expect(seen.starts).toBe(0);
    });

    it.each([
      ["a path", "../acme"],
      ["a nested path", "acme/backend"],
      ["a Windows path", "acme\\backend"],
      ["a dot", "."],
      ["two dots", ".."],
      ["an empty id", ""],
      ["capitals", "Acme"],
      ["a drive", "c:"],
      ["a stream", "acme:stream"],
      ["a hidden name", ".acme"],
      ["a null byte", "acme\0"],
      ["a space", "acme "],
      ["a trailing dot", "acme."],
      ["a Windows device name", "con"],
      ["a Windows device name with an extension", "nul.txt"],
    ])("reads nothing from the disk for %s as a plugin id", async (_name, plugin) => {
      const { backends, readNames } = await setup();
      expect(await refusedWith(backends.trustedFingerprint(plugin))).toBe("plugin_not_trusted");
      expect(readNames).toEqual([]);
    });

    it("keeps a runner after a tool's own error, and not after any other failure", async () => {
      const { backends } = await setup();
      expect(backends.runnerSurvives(new RunnerToolError("bad input"))).toBe(true);
      expect(backends.runnerSurvives(new Error("the runner stopped"))).toBe(false);
    });
  });
});

verifies("agent-host.plugin-secrets", () => {
  describe("the names of a plugin's secrets", () => {
    it("names each secret a trusted plugin declares by the plugin's own name for it", async () => {
      const { backends } = await setup();
      expect(await backends.trustedSecretNames("acme")).toEqual({
        "acme-key": "plugin__acme__acme-key",
      });
    });

    it("names no secret of a plugin nobody trusted, or one that changed since", async () => {
      const untrusted = await setup({ trusted: false });
      expect(await refusedWith(untrusted.backends.trustedSecretNames("acme"))).toBe(
        "plugin_not_trusted",
      );
      const { backends } = await setup();
      await put({ "acme/backend/index.js": "export default { changed: true };\n" });
      expect(await refusedWith(backends.trustedSecretNames("acme"))).toBe("plugin_not_trusted");
    });
  });
});

/** The fixture plugin with a sign-in that names a client secret, and `sdk: 2`, which a sign-in needs. */
const signInManifest = `id: acme
version: 1.0.0
sdk: 2
name: Acme
backend:
  hosts: [api.acme.example]
  secrets:
    acme-client: { purpose: The Acme app's client secret }
  signIns:
    acme-account:
      purpose: Access to your Acme account.
      flow: oauth-code
      authorizeUrl: https://auth.acme.example/authorize
      tokenUrl: https://auth.acme.example/token
      clientId: { fromSetting: clientId }
      clientSecret: acme-client
      access: { hosts: [api.acme.example], as: bearer }
  tools:
    - { name: echo, description: Echoes., risk: read, untrusted: true }
`;

verifies("agent-host.plugin-sign-ins", () => {
  describe("a plugin's sign-ins", () => {
    beforeEach(async () => {
      await put({ "acme/plugin.yaml": signInManifest });
    });

    it("reads the trusted plugin's backend sheet and the settings its backend starts with", async () => {
      const { machine } = await setup({ settings: { clientId: "acme-app" } });
      const signIns = pluginSignIns({ machine, secrets: new MemorySecrets({}) });
      const read = await signIns("acme")?.read();
      expect(read?.sheet.id).toBe("acme");
      expect(Object.keys(read?.sheet.signIns ?? {})).toEqual(["acme-account"]);
      expect(read?.settings).toEqual({ clientId: "acme-app" });
    });

    it("reads the client secret only from the plugin's own handed-over secrets", async () => {
      const { machine } = await setup();
      const secrets = new MemorySecrets({
        "plugin__acme__acme-client": "acme-client-value",
        "acme-client": "workspace-value",
        "plugin__rain__acme-client": "other-plugin-value",
      });
      const signIns = pluginSignIns({ machine, secrets })("acme");
      expect(await signIns?.secrets.get("acme-client")).toBe("acme-client-value");
      expect(await signIns?.secrets.get("plugin__acme__acme-client")).toBeNull();
    });

    it("gives no sheet and no client secret for a plugin nobody trusted, or one that changed since", async () => {
      const secrets = new MemorySecrets({ "plugin__acme__acme-client": "acme-client-value" });
      const untrusted = (await setup({ trusted: false })).machine;
      const notTrusted = pluginSignIns({ machine: untrusted, secrets })("acme");
      expect(await refusedWith(notTrusted?.read() ?? Promise.resolve())).toBe("plugin_not_trusted");
      const { machine } = await setup();
      await put({ "acme/backend/index.js": "export default { changed: true };\n" });
      const changed = pluginSignIns({ machine, secrets })("acme");
      expect(await refusedWith(changed?.read() ?? Promise.resolve())).toBe("plugin_not_trusted");
      expect(await refusedWith(changed?.secrets.get("acme-client") ?? Promise.resolve())).toBe(
        "plugin_not_trusted",
      );
    });

    it("runs no sign-ins for a name that can't be a plugin's id", async () => {
      const { machine } = await setup();
      const signIns = pluginSignIns({ machine, secrets: new MemorySecrets({}) });
      expect(signIns("../acme")).toBeUndefined();
      expect(signIns("Acme")).toBeUndefined();
    });

    it("gives a backend's start the sign-in tokens of its own plugin", async () => {
      const { backends, signInAsks } = await setup({ settings: { clientId: "acme-app" } });
      const client = await backends.open("acme", await backends.trustedFingerprint("acme"));
      await client.close();
      expect(signInAsks).toEqual(["acme"]);
    });
  });
});
