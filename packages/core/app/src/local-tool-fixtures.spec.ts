// Fixtures for the tests of `PluginLocalTools`: a `files` plugin with one
// local tool, a sandbox that opens fake sessions, and a factory whose
// connectors answer with their session's working folder.

import type {
  Clock,
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  Digest,
  Sandbox,
  SandboxCheck,
  SandboxFence,
  SandboxProfile,
} from "@halonicjs/ports";
import { FakeSandboxSession, idleProgram } from "@halonicjs/testing-contracts";
import type { PluginToolSet } from "./plugin-contributions.ts";
import { type LocalToolMxc, type LocalToolSet, PluginLocalTools } from "./plugin-local-tools.ts";
import type { PluginStartTrustOptions } from "./plugin-start-trust.ts";
import type { PluginTrustCheck } from "./plugin-trust.ts";
import { TestFolderReader } from "./testing/test-folder-reader.ts";

export const trust = { location: "/profile/plugins/files", fingerprint: "hfp1:files" };

/** SHA-256 from Web Crypto, as the platforms' `Digest` adapters give it. */
export const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

export const clock: Clock = { now: () => new Date("2026-11-18T09:00:00.000Z") };

export const filesManifest = `id: files
version: 1.0.0
sdk: 1
name: Files
description: Lists files.
localTools:
  - id: lister
    start: { script: { program: node, path: tools/server.js } }
    tools:
      - { name: list-files, description: Lists the files., risk: read, untrusted: true }
`;

/** The plugin folder with the `files` plugin in it. */
export function filesFolder(): TestFolderReader {
  return new TestFolderReader().putFiles({
    "files/plugin.yaml": filesManifest,
    "files/tools/server.js": "console.log('lister');\n",
  });
}

/** A trust check that finds the `files` plugin trusted with the grant `trust`, as loaded. */
export function trustedAsLoaded(): PluginStartTrustOptions {
  return {
    plugins: filesFolder(),
    digest,
    trust: {
      checkPlugin: async () =>
        ({ status: "trusted", fingerprint: trust.fingerprint }) as PluginTrustCheck,
    },
  };
}

export const lister: LocalToolSet = {
  plugin: "files",
  part: "local:lister",
  declared: [
    { name: "list-files", description: "Lists the files.", risk: "read", untrusted: true },
  ],
  trust,
};

export const backend: PluginToolSet = { ...lister, part: "backend" };

export const config: ConnectorConfig = {
  id: "files:lister",
  transport: { kind: "stdio", command: "node", args: ["server.js"], env: {} },
  secretEnv: {},
};

/** A profile whose working folder says which session it is. */
export function profileNumber(n: number): SandboxProfile {
  return {
    workingFolder: `/data/local-tools/files-lister-${n}`,
    tempFolder: `/data/temp/files-lister-${n}`,
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: {},
    network: { bridge: null, allowedSites: [] },
    timeLimitMs: 60_000,
  };
}

export const ok: SandboxCheck = { ok: true, reason: null, missing: [] };

/** A sandbox that opens fake sessions and keeps each one. */
export class TestSandbox implements Pick<Sandbox, "check" | "open"> {
  readonly sessions: FakeSandboxSession[] = [];
  checkResult: SandboxCheck = ok;
  /** The fence proof each new session reports. */
  fence: SandboxFence = { state: "fenced" };

  async check(): Promise<SandboxCheck> {
    return this.checkResult;
  }

  async open(profile: SandboxProfile): Promise<FakeSandboxSession> {
    if (!this.checkResult.ok) throw new Error("bubblewrap is not installed");
    const session = new FakeSandboxSession({ profile, program: idleProgram, fence: this.fence });
    this.sessions.push(session);
    return session;
  }
}

/**
 * A factory whose connectors answer with their session's working folder.
 * The tool `outlast` runs until the session's time limit runs out.
 */
export class TestFactory implements ConnectorFactory {
  readonly transport = "stdio";
  readonly contexts: ConnectorFactoryContext[] = [];
  closed = 0;
  /** When set, each connector's close throws after counting itself. */
  closeFails = false;

  create(created: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    this.contexts.push(context);
    const session = context.sandbox;
    if (session === undefined) throw new Error("no session");
    return {
      id: created.id,
      listTools: async () => [],
      callTool: async (name) => {
        if (name === "outlast") await session.close();
        if (session.fence.state === "stopped") throw new Error("its sandbox session has ended");
        return session.profile.workingFolder;
      },
      close: async () => {
        this.closed += 1;
        if (this.closeFails) throw new Error("the connector didn't close");
      },
    };
  }
}

/** The profile of session `n` with `sites` as its allowed sites. */
export function profileWithSites(n: number, sites: readonly string[]): SandboxProfile {
  const profile = profileNumber(n);
  return { ...profile, network: { ...profile.network, allowedSites: [...sites] } };
}

export function setUp(
  sandbox: TestSandbox | null = new TestSandbox(),
  options: {
    mxc?: LocalToolMxc;
    sites?: readonly string[];
    startTrust?: PluginStartTrustOptions;
    releaseFails?: boolean;
  } = {},
) {
  const factory = new TestFactory();
  let prepared = 0;
  /** The number of each session whose setup was released, in order. */
  const released: number[] = [];
  const local = new PluginLocalTools({
    sandbox,
    ...(options.mxc === undefined ? {} : { mxc: options.mxc }),
    factory,
    context: {} as Omit<ConnectorFactoryContext, "trust" | "sandbox">,
    startTrust: options.startTrust ?? trustedAsLoaded(),
    prepare: async () => {
      prepared += 1;
      const n = prepared;
      return {
        config,
        profile: profileWithSites(n, options.sites ?? []),
        release: async () => {
          released.push(n);
          if (options.releaseFails === true) throw new Error("the folder is busy");
        },
      };
    },
  });
  return { local, factory, sandbox, released };
}
