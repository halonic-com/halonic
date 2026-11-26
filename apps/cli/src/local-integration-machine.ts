// What opening a local integration uses on this computer (HAL-8089): the
// start gate with the srt sandbox as the fenced one and the launcher's as the
// confirmed path, Node and the built runner, and a fresh private temp folder
// for every start. The trust check is read again at every start, on the
// integrations in the folder the runner starts from.
//
// A local integration runs without the sandbox only with the yes Studio's
// agent host saved in the profile, for the reason at this start (HAL-15144);
// the command only reads it (`SavedUnfencedYes`). A plugin's backend has a
// gate of its own that holds no yes (HAL-12639): whether the command honours
// the yes for plugins is a decision of its own.

import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { workspaceIntegrations } from "@halonicjs/adapter-doctor-node";
import {
  FileRecordStore,
  FileSandboxSettingStore,
  FileSystemFolderReader,
} from "@halonicjs/adapter-fs-node";
import { type AddressCheckingHttpClient, connectorHostClass } from "@halonicjs/adapter-http-kit";
import { createNodeHttpClient, type Resolve } from "@halonicjs/adapter-http-node";
import {
  type RunnerMachine,
  runnerFile,
  runnerNodeFolder,
  socketFolders,
  systemFiles,
} from "@halonicjs/adapter-integration-runner";
import { createHostSandbox } from "@halonicjs/adapter-sandbox-host";
import { makeRunnerTempFolder, sandboxRuntimeFolder } from "@halonicjs/adapter-sandbox-srt";
import {
  ConnectorPauses,
  noUnfencedRunConsent,
  RunnerStartGate,
  type SaveTimers,
  UnfencedRuns,
} from "@halonicjs/app";
import type { Sandbox, UnfencedRunConsentStore } from "@halonicjs/ports";
import {
  connectorPausesFolder,
  type ProfileEnvironment,
  pluginsFolder,
  profileFolder,
  runnerTempFolder,
  sharedRunnerTempFolder,
  unfencedRunsFolder,
} from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { proxySetting, recordingSrtSandbox } from "@halonicjs/target-node-harness";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { LocalIntegrationMachine } from "./open-local-integration.ts";
import type { PluginBackendMachine } from "./open-plugin-backend.ts";
import { openPluginService } from "./plugin-host.ts";
import { type RunConnectorLines, unfencedIntegrationReporter } from "./plugin-part-warnings.ts";
import { SavedUnfencedYes, studioYesReaches } from "./saved-unfenced-yes.ts";
import type { WorkspaceAtVersion } from "./workspace-at-version.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";
import { nodeProfileEnvironment, webCryptoDigest } from "./workspace-runs.ts";
import {
  cliTrustService,
  readWorkspaceTrust,
  type WorkspaceTrustMachine,
} from "./workspace-trust.ts";

/** How long one runner may live, in milliseconds; a start after it asks the trust check and the gate again. */
const runnerTimeLimitMs = 10 * 60 * 1000;

/** Node's timers for a start's time limit and for reading the saved yes again; they don't keep the process open by themselves. */
const nodeTimers: SaveTimers = {
  set: (callback, delayMs) => setTimeout(callback, delayMs).unref(),
  clear: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

/** A {@link LocalIntegrationMachine} that removes the temp folders it made once the engine is done. */
export interface ComputerIntegrationMachine extends LocalIntegrationMachine {
  /** Removes the temp folders of every start. Safe to call twice. */
  dispose(): Promise<void>;
  /** The sandboxes its gate starts in, which the plugin backends' own gate shares. */
  readonly sandboxes: GateSandboxes;
}

/** The fenced sandbox a gate checks at every start, and the launcher's for a start without the fence. */
interface GateSandboxes {
  readonly fenced: Sandbox;
  readonly launcher: Sandbox;
}

/** What the machine reads that the command already has. */
export interface ComputerIntegrationInput {
  /** The workspace folder, as the command opened it. */
  readonly dir: OpenWorkspaceDir;
  /** The workspace as the run uses it. */
  readonly workspace: LoadedWorkspace;
  /** The trust records, clock and program search the trust check reads. */
  readonly trust: WorkspaceTrustMachine;
  /** What the integration's own requests go out through; the sheet limits the hosts, and a host it lists under `localHosts` may be this computer or the home network. */
  readonly transport?: AddressCheckingHttpClient;
  readonly environment?: ProfileEnvironment;
  /**
   * For tests only: the fenced sandbox the gate checks at every start, in place of `srt`.
   * A test passes one whose check fails. The command never sets it.
   */
  readonly testFencedSandbox?: Sandbox;
  /**
   * For tests only: the launcher's sandbox for a start without the fence, in place of `sandbox-host`.
   * A test passes one that counts starts. The command never sets it.
   */
  readonly testLauncher?: Sandbox;
  /** Where the run's warning goes when an integration starts without the sandbox; nowhere when left out. */
  readonly lines?: RunConnectorLines;
}

/** A start gate on this computer in `sandboxes`, with `store` as the saved yes. */
function computerGate(sandboxes: GateSandboxes, store: UnfencedRunConsentStore): RunnerStartGate {
  return new RunnerStartGate({
    platform: process.platform,
    ...sandboxes,
    runs: new UnfencedRuns({ store, clock: systemClock, timers: nodeTimers }),
    timers: nodeTimers,
  });
}

/**
 * The machine for local integrations on this computer.
 *
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't absolute
 */
export function computerIntegrationMachine(
  input: ComputerIntegrationInput,
): ComputerIntegrationMachine {
  const profile = profileFolder(input.environment ?? nodeProfileEnvironment());
  const sandboxes: GateSandboxes = {
    // Records each session's folders, so a sweep on this profile never takes a live one's grant (HAL-6780).
    fenced: input.testFencedSandbox ?? recordingSrtSandbox(profile),
    launcher: input.testLauncher ?? createHostSandbox(),
  };
  const saved = new SavedUnfencedYes(unfencedRunsFolder(profile));
  const gate = computerGate(sandboxes, saved);
  const reportUnfenced = unfencedIntegrationReporter(input.lines);
  const trust = cliTrustService(input.trust.trustStore, input.trust.clock);
  const pausesFolder = connectorPausesFolder(profile);
  const made: string[] = [];
  return {
    // Shown as the workspace, since a copy's own path means nothing to the person.
    folderAt: (root) => new FileSystemFolderReader(root, input.dir.shown),
    digest: webCryptoDigest,
    gate,
    pauses: new ConnectorPauses({
      records: new FileRecordStore(pausesFolder),
      place: pausesFolder,
      clock: input.trust.clock,
    }),
    pauseNotSaved: (error) => {
      const reason = error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `The connector's pause couldn't be saved in ${pausesFolder}: ${reason}\n`,
      );
    },
    sandboxes,
    unreadableYes: () => saved.unreadableFile,
    // The choice Studio's shell saves in `<profile>/sandbox`, as the agent host reads it.
    studioYesReaches: () =>
      studioYesReaches(
        process.platform,
        new FileSandboxSettingStore(join(profile.root, "sandbox")),
      ),
    startedUnfenced: reportUnfenced,
    runtime: {
      node: process.execPath,
      nodeFolder: runnerNodeFolder(process.execPath),
      runnerFile: runnerFile(),
    },
    transport: input.transport ?? integrationTransport(),
    // Read again at every start: what was checked when the command began is never reused.
    // The integrations in the folder the runner starts from, as the start hashes them, so
    // the two agree; one that differs from the trusted version fails closed.
    trustCheck: async ({ workspaceRoot }) => {
      if (workspaceRoot === undefined) {
        throw new Error("there is no workspace folder to run it from");
      }
      const version: WorkspaceAtVersion = {
        workspace: input.workspace,
        integrations: await workspaceIntegrations(workspaceRoot, input.dir.shown),
      };
      const read = await readWorkspaceTrust(input.dir, input.trust.commandSearch, version);
      return await trust.check(read.subject);
    },
    runnerMachine: async (): Promise<RunnerMachine> => {
      const tempFolder = await makeRunnerTempFolder(
        {
          privateParent: runnerTempFolder(profile),
          sharedParent: sharedRunnerTempFolder(profile),
        },
        { log: (text) => process.stderr.write(text) },
      );
      made.push(tempFolder);
      return {
        homeFolder: homedir(),
        socketFolders: socketFolders(process.env),
        systemFiles: systemFiles(process.platform),
        sandboxFolders: [sandboxRuntimeFolder()],
        tempFolder,
        timeLimitMs: runnerTimeLimitMs,
        windowsFolder: process.env["SystemRoot"],
      };
    },
    dispose: async () => {
      await Promise.all(
        made.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
      );
    },
  };
}

/**
 * What local integrations' requests go out through: the Node transport, which
 * checks the addresses a name resolves to on every request. A name counts as
 * public unless the integration's sheet makes it private, which the kit does
 * per integration with `withPrivateNames`. A test passes a fake `resolve`.
 */
export function integrationTransport(resolve?: Resolve): AddressCheckingHttpClient {
  return createNodeHttpClient({
    hostClass: connectorHostClass,
    proxy: proxySetting,
    ...(resolve === undefined ? {} : { resolve }),
  });
}

/**
 * The machine for plugin backends on this computer: the integrations'
 * sandboxes, runner and temp folders, so a plugin's backend starts as a
 * local integration does, plus the profile's plugins folder, the plugin trust and
 * the plugin's saved settings. Its gate is its own, with the same sandboxes
 * and no saved yes (`cli.no-unfenced-run-yes`).
 *
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't absolute
 */
export function computerPluginMachine(
  integrations: ComputerIntegrationMachine,
  input: Pick<ComputerIntegrationInput, "trust" | "environment">,
): PluginBackendMachine {
  const environment = input.environment ?? nodeProfileEnvironment();
  const service = openPluginService({ profile: environment, clock: input.trust.clock });
  return {
    gate: computerGate(integrations.sandboxes, noUnfencedRunConsent),
    runtime: integrations.runtime,
    transport: integrations.transport,
    runnerMachine: integrations.runnerMachine,
    plugins: new FileSystemFolderReader(pluginsFolder(profileFolder(environment))),
    digest: webCryptoDigest,
    trust: cliTrustService(input.trust.trustStore, input.trust.clock),
    settings: async (plugin) => await service.settings(plugin),
  };
}
