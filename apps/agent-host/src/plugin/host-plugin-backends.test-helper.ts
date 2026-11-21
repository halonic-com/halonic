import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import type { PluginBackendMachine, StartedRunner } from "@halonicjs/adapter-integration-runner";
import {
  MemorySecrets,
  MemoryTokenStore,
  MemoryTrustStore,
  MemoryUnfencedRunConsentStore,
} from "@halonicjs/adapter-memory";
import {
  type LocalToolSet,
  type PluginConnectorSources,
  type PluginLocalTools,
  RunnerStartGate,
  readPluginFolder,
  TrustService,
  UnfencedRuns,
} from "@halonicjs/app";
import type {
  ConnectorClient,
  FolderReader,
  Sandbox,
  SandboxCheck,
  SignInTokens,
} from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { type HostPluginContext, hostPluginBackends } from "./host-plugin-backends.ts";
import { PluginRefusal } from "./plugin-refusal.ts";

/** These tests never take a yes back in another process and no start hangs, so no timer goes off. */
const idleTimers = { set: () => undefined, clear: () => undefined };

const clock = fixedClock(Date.UTC(2026, 10, 14, 9));
const passes: SandboxCheck = { ok: true, reason: null, missing: [] };
export const onWindows: SandboxCheck = { ok: false, reason: "windows", missing: [] };

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

/** The same plugin with a local tool beside its backend. */
export const withLocalTool = `${manifest}localTools:
  - id: lister
    start: { script: { program: node, path: tools/server.js } }
    tools:
      - { name: list-files, description: Lists the files., risk: read, untrusted: true }
`;

/** A plugin whose only part is a local tool. */
export const onlyLocalTool = `id: acme
version: 1.0.0
sdk: 1
name: Acme
localTools:
  - id: lister
    start: { script: { program: node, path: tools/server.js } }
    tools:
      - { name: list-files, description: Lists the files., risk: read, untrusted: true }
`;

/**
 * Local tools whose connectors answer, or fail to start as a test asks. Each
 * set a connector was made for is kept.
 */
export class FakeLocalTools {
  readonly sets: LocalToolSet[] = [];
  /** Set to make every local tool fail to start with this error. */
  startError: Error | undefined;

  readonly source: PluginConnectorSources["localTools"] = async () =>
    ({ connector: (set: LocalToolSet) => this.#connectorFor(set) }) as unknown as PluginLocalTools;

  #connectorFor(set: LocalToolSet): ConnectorClient {
    this.sets.push(set);
    return {
      id: `acme:${set.part}`,
      listTools: async () => [],
      callTool: async (name) => {
        if (this.startError !== undefined) throw this.startError;
        return `local answer from ${name}`;
      },
      close: async () => undefined,
    };
  }
}

/** Local tools no test reaches: the plugin then has none. */
const noLocalTools: PluginConnectorSources["localTools"] = async () => {
  throw new Error("this plugin has no local tool");
};

const digest = {
  async sha256(data: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

let root: string;

/** Makes a plugins folder of the test's own, with the plugin `acme` and its backend in it; a test file's `beforeEach`. */
export async function makePluginsFolder(): Promise<void> {
  root = await mkdtemp(join(tmpdir(), "halonic-host-plugin-"));
  await put({ "acme/plugin.yaml": manifest, "acme/backend/index.js": "export default {};\n" });
}

/** Removes the test's plugins folder; a test file's `afterEach`. */
export async function removePluginsFolder(): Promise<void> {
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
}

/** The test's plugins folder. */
export function pluginsFolder(): string {
  return root;
}

export async function put(files: Record<string, string>): Promise<void> {
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
export async function setup(
  options: {
    check?: SandboxCheck;
    trusted?: boolean;
    platform?: NodeJS.Platform;
    /** The user's saved yes for running without the sandbox, for this reason. */
    allowed?: "windows";
    /** The plugin's saved setting values. */
    settings?: Record<string, string>;
    localTools?: PluginConnectorSources["localTools"];
  } = {},
) {
  const { check = passes, trusted = true, platform = "linux", localTools = noLocalTools } = options;
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
  const backends = hostPluginBackends(machine, context, localTools, (text) => logged.push(text));
  return { backends, machine, seen, launched, readNames, logged, signInAsks };
}

export async function refusedWith(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  return error instanceof PluginRefusal ? error.code : undefined;
}
