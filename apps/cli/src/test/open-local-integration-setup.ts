/**
 * The opener's test setup: a trusted workspace with the integration `notes`,
 * a start gate over a fake sandbox, and a runner that counts its starts and
 * stops (`cli.open-local-integration`).
 */
import { workspaceIntegrations } from "@halonicjs/adapter-doctor-node";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import type { AddressCheckingHttpClient } from "@halonicjs/adapter-http-kit";
import type { StartedRunner } from "@halonicjs/adapter-integration-runner";
import {
  MemorySecrets,
  MemoryTokenStore,
  MemoryTrustStore,
  MemoryUnfencedRunConsentStore,
} from "@halonicjs/adapter-memory";
import {
  RunnerStartGate,
  type TrustCheck,
  trustContentInputOf,
  UnfencedRuns,
} from "@halonicjs/app";
import type { Connector } from "@halonicjs/format";
import type {
  ConnectorFactoryContext,
  ConnectorTransport,
  IntegrationHttpClient,
  IntegrationTool,
  Sandbox,
  SandboxCheck,
} from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { IntegrationConnectorFactory } from "../integration-connector-factory.ts";
import { type LocalIntegrationMachine, openLocalIntegration } from "../open-local-integration.ts";
import { webCryptoDigest } from "../workspace-runs.ts";
import { cliTrustService } from "../workspace-trust.ts";

/** These tests never take a yes back in another process and no start hangs, so no timer goes off. */
export const idleTimers = { set: () => undefined, clear: () => undefined };

export const clock = fixedClock(Date.UTC(2026, 10, 12, 9));
export const passes: SandboxCheck = { ok: true, reason: null, missing: [] };
export const onWindows: SandboxCheck = { ok: false, reason: "windows", missing: [] };

export const sheet = `id: notes
version: 1.0.0
kit: 1
provides: [connector]
hosts: [api.example.com]
tools:
  - { name: read-note, description: Reads a note., risk: read, untrusted: true }
`;

/** The sheet with its one host read from the `url` setting. */
export const fromSettingSheet = sheet.replace(
  "hosts: [api.example.com]",
  "hosts: [{ fromSetting: url, class: private }]",
);

export const readNote: IntegrationTool = {
  name: "read-note",
  description: "Reads a note.",
  parameters: { type: "object", properties: {} },
  risk: "read",
  untrusted: true,
};

/** A sandbox the gate only checks; the runner's start is faked. */
export function sandbox(check: SandboxCheck): Sandbox {
  return {
    check: async () => check,
    capabilities: () => ({ files: "shared", strength: "os" }),
    open: async () => {
      throw new Error("the fake start never opens a session");
    },
  };
}

/** Everything the opener uses, with a runner that answers `answer` and counts its starts and stops. */
export async function setupOpener(
  root: string,
  options: {
    check?: SandboxCheck;
    runnerBuilt?: boolean;
    beforeTrustCheck?: () => Promise<void>;
    /** The connector file's settings when the workspace is trusted. */
    trustedSettings?: Record<string, string>;
    /** The connector file's settings when the run opens it; the trusted ones unless a test says otherwise. */
    runSettings?: Record<string, string>;
    /** What the integration's requests go out through; one that answers `{}` unless a test says otherwise. */
    transport?: AddressCheckingHttpClient;
    /** What the runner's tool does with the kit's client; it answers with the tool's name unless a test says otherwise. */
    tool?: (http: IntegrationHttpClient) => Promise<string>;
    /** The user's saved yes to run without the sandbox, for this reason. */
    savedYes?: string;
    /** The saved yes's file, as the machine reports it when the yes can't be read. */
    unreadableYes?: string;
    /** What a fenced runner's fence proof says; it holds unless a test says otherwise. */
    fenceProof?: StartedRunner["fence"];
    /** Whether a yes given in Studio reaches the command; it does unless a test says otherwise. */
    studioYesReaches?: boolean;
  } = {},
) {
  const { check = passes, runnerBuilt = true, beforeTrustCheck, trustedSettings } = options;
  const { runSettings = trustedSettings } = options;
  const trust = cliTrustService(new MemoryTrustStore(), clock);
  // The trust check reads the integration's settings from its connector file,
  // as `trustContentInputOf` does for every command.
  const connectorFile: Connector = {
    version: 1,
    id: "notes",
    transport: {
      integration: {
        folder: "notes",
        ...(trustedSettings === undefined ? {} : { settings: trustedSettings }),
      },
    },
    tools: { approve: [] },
  };
  const loaded = {
    files: [
      { kind: "connector", path: "library/connectors/notes.connector.yaml", value: connectorFile },
    ],
  } as unknown as LoadedWorkspace;
  const subject = async () => ({
    location: root,
    connectors: [],
    commandPaths: new Map(),
    agents: [],
    integrations: trustContentInputOf(loaded, await workspaceIntegrations(root, root)).integrations,
    providers: [],
  });
  const shown = await trust.check(await subject());
  if (shown.status === "refused") throw new Error("nothing to refuse");
  await trust.grant(await subject(), shown.fingerprint, "cli");

  const seen = {
    starts: 0,
    stops: 0,
    entries: [] as string[],
    checks: 0,
    settings: [] as Readonly<Record<string, unknown>>[],
    unfenced: [] as string[],
  };
  const store = new MemoryUnfencedRunConsentStore();
  if (options.savedYes !== undefined) {
    await store.save({ reason: options.savedYes, allowedAt: "2026-11-09T10:00:00.000Z" });
  }
  const launcher = sandbox(check);
  const machine: LocalIntegrationMachine = {
    workspace: new FileSystemFolderReader(root, root),
    digest: webCryptoDigest,
    gate: new RunnerStartGate({
      platform: "linux",
      fenced: sandbox(check),
      launcher,
      runs: new UnfencedRuns({
        store,
        clock,
        timers: idleTimers,
      }),
      timers: idleTimers,
    }),
    unreadableYes: () => options.unreadableYes,
    studioYesReaches: async () => options.studioYesReaches ?? true,
    startedUnfenced: (reason) => seen.unfenced.push(reason),
    runtime: { node: "/node/bin/node", nodeFolder: "/node", runnerFile: "/runner/runner.mjs" },
    transport: options.transport ?? ({ fetch: async () => new Response("{}") } as never),
    trustCheck: async (): Promise<TrustCheck> => {
      seen.checks += 1;
      await beforeTrustCheck?.();
      return await trust.check(await subject());
    },
    runnerMachine: async () => ({
      homeFolder: "home-folder",
      socketFolders: [],
      systemFiles: [],
      sandboxFolders: [],
      tempFolder: "temp-folder",
      timeLimitMs: 1000,
    }),
    runnerExists: () => runnerBuilt,
    startRunner: async (start) => {
      seen.starts += 1;
      seen.entries.push(`${start.entry.file}#${start.entry.exportName}`);
      seen.settings.push(start.settings);
      const runner: StartedRunner = {
        fence:
          start.sandbox === launcher
            ? { state: "off" }
            : (options.fenceProof ?? { state: "fenced" }),
        declaration: { name: "notes", version: "1.0.0", tools: [readNote] },
        stopped: new Promise(() => {}),
        callTool: async (name) => (options.tool ? options.tool(start.http) : `answer from ${name}`),
        close: async () => {
          seen.stops += 1;
        },
      };
      return runner;
    },
  };
  const context = {
    secrets: new MemorySecrets({}),
    tokens: new MemoryTokenStore(),
    workspaceRoot: root,
    trust: null,
  } as unknown as ConnectorFactoryContext;
  const factory = new IntegrationConnectorFactory(openLocalIntegration(machine));
  const transport: ConnectorTransport = {
    kind: "integration",
    folder: "notes",
    ...(runSettings === undefined ? {} : { settings: runSettings }),
  };
  const client = () => factory.create({ id: "notes", transport, secretEnv: {} }, context);
  return { seen, client };
}
