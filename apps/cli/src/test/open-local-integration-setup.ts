/**
 * The opener's test setup: a trusted workspace with the integration `notes`,
 * a start gate over a fake sandbox, and a runner that counts its starts and
 * stops (`cli.open-local-integration`).
 */

import { join } from "node:path";
import { workspaceIntegrations } from "@halonicjs/adapter-doctor-node";
import { FileRecordStore, FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import type { AddressCheckingHttpClient } from "@halonicjs/adapter-http-kit";
import {
  type LocalRequestLog,
  type RunnerBlock,
  RunnerStoppedError,
  type StartedRunner,
} from "@halonicjs/adapter-integration-runner";
import {
  MemorySecrets,
  MemoryTokenStore,
  MemoryTrustStore,
  MemoryUnfencedRunConsentStore,
} from "@halonicjs/adapter-memory";
import {
  ConnectorPauses,
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
    /**
     * What the runner's tool does with the kit's client; it answers with the
     * tool's name unless a test says otherwise. `block` reports a block as the
     * runner does, before the refusal goes back to the code.
     */
    tool?: (http: IntegrationHttpClient, block: (block: RunnerBlock) => void) => Promise<string>;
    /** The profile's folder of paused connectors; a new run of the same profile passes the same one. */
    pausesFolder?: string;
    /** The user's saved yes to run without the sandbox, for this reason. */
    savedYes?: string;
    /** The saved yes's file, as the machine reports it when the yes can't be read. */
    unreadableYes?: string;
    /** What a fenced runner's fence proof says; it holds unless a test says otherwise. */
    fenceProof?: StartedRunner["fence"];
    /** Whether a yes given in Studio reaches the command; it does unless a test says otherwise. */
    studioYesReaches?: boolean;
    /** The folder the run starts the runner from, such as a copy of a commit; `root`, the trusted one, unless a test says otherwise. */
    startFrom?: string;
    /** Where the integration's requests are kept; nowhere unless a test says otherwise. */
    requestLog?: () => Promise<LocalRequestLog>;
  } = {},
) {
  const { check = passes, runnerBuilt = true, beforeTrustCheck, trustedSettings } = options;
  const { runSettings = trustedSettings, startFrom = root } = options;
  // Outside `integrations`, so the trust check never reads it, and removed with `root`.
  const { pausesFolder = join(root, ".profile", "connector-pauses") } = options;
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
  // The integrations in `folder`, as the machine's trust check reads them from where the runner starts.
  const subject = async (folder: string) => ({
    location: root,
    connectors: [],
    commandPaths: new Map(),
    connectorFiles: new Map(),
    agents: [],
    integrations: trustContentInputOf(loaded, await workspaceIntegrations(folder, root))
      .integrations,
    providers: [],
  });
  /** Trusts the workspace as it is now, as a person would. */
  const trustAgain = async () => {
    const shown = await trust.check(await subject(root));
    if (shown.status === "refused") throw new Error("nothing to refuse");
    await trust.grant(await subject(root), shown.fingerprint, "cli");
  };
  await trustAgain();

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
  const pauses = new ConnectorPauses({
    records: new FileRecordStore(pausesFolder),
    place: pausesFolder,
    clock,
  });
  const machine: LocalIntegrationMachine = {
    folderAt: (folder) => new FileSystemFolderReader(folder, root),
    digest: webCryptoDigest,
    pauses,
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
    trustCheck: async ({ workspaceRoot }): Promise<TrustCheck> => {
      seen.checks += 1;
      await beforeTrustCheck?.();
      return await trust.check(await subject(workspaceRoot ?? root));
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
    ...(options.requestLog === undefined ? {} : { requestLog: options.requestLog }),
    startRunner: async (start) => {
      seen.starts += 1;
      // Closing fails every call in flight and every later one, as the runner's bridge does.
      const inFlight = new Set<(error: Error) => void>();
      let closed = false;
      seen.entries.push(`${start.entry.file}#${start.entry.exportName}`);
      seen.settings.push(start.settings);
      const runner: StartedRunner = {
        fence:
          start.sandbox === launcher
            ? { state: "off" }
            : (options.fenceProof ?? { state: "fenced" }),
        declaration: { name: "notes", version: "1.0.0", tools: [readNote] },
        stopped: new Promise(() => {}),
        callTool: (name) =>
          new Promise<string>((resolve, reject) => {
            if (closed) return reject(new RunnerStoppedError({ reason: "closed" }));
            inFlight.add(reject);
            const block = (reported: RunnerBlock) => start.onBlocked?.(reported);
            const answer = options.tool ? options.tool(start.http, block) : `answer from ${name}`;
            Promise.resolve(answer).then(resolve, reject);
          }),
        close: async () => {
          seen.stops += 1;
          closed = true;
          for (const fail of inFlight) fail(new RunnerStoppedError({ reason: "closed" }));
        },
      };
      return runner;
    },
  };
  const context = {
    secrets: new MemorySecrets({}),
    tokens: new MemoryTokenStore(),
    workspaceRoot: startFrom,
    trust: null,
  } as unknown as ConnectorFactoryContext;
  const factory = new IntegrationConnectorFactory(openLocalIntegration(machine));
  const transport: ConnectorTransport = {
    kind: "integration",
    folder: "notes",
    ...(runSettings === undefined ? {} : { settings: runSettings }),
  };
  /** The connector `id`, of the integration `notes`. */
  const client = (id = "notes") => factory.create({ id, transport, secretEnv: {} }, context);
  return { seen, client, trustAgain, pauses, pausesFolder };
}
