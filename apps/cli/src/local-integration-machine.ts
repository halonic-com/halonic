// What opening a local integration uses on this computer (HAL-8089): the
// start gate with the srt sandbox as the fenced one and the launcher's as the
// confirmed path, Node and the built runner, and a fresh private temp folder
// for every start. The trust check is read again from the workspace's files at
// every start.
//
// The gate holds no saved yes to run without the sandbox (HAL-12639): nothing
// offers that yes yet, so a file placed in the profile's `unfenced-runs`
// folder by hand must not start anything, as in the agent host.
// `FileUnfencedRunConsentStore` waits for the flow that offers it.

import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import { type AddressCheckingHttpClient, connectorHostClass } from "@halonicjs/adapter-http-kit";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import {
  type RunnerMachine,
  runnerFile,
  runnerNodeFolder,
  socketFolders,
  systemFiles,
} from "@halonicjs/adapter-integration-runner";
import { createHostSandbox } from "@halonicjs/adapter-sandbox-host";
import {
  makeRunnerTempFolder,
  SrtSandbox,
  sandboxRuntimeFolder,
} from "@halonicjs/adapter-sandbox-srt";
import {
  noUnfencedRunConsent,
  RunnerStartGate,
  type SaveTimers,
  UnfencedRuns,
} from "@halonicjs/app";
import type { Sandbox } from "@halonicjs/ports";
import {
  type ProfileEnvironment,
  pluginsFolder,
  profileFolder,
  runnerTempFolder,
  sharedRunnerTempFolder,
} from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { LocalIntegrationMachine } from "./open-local-integration.ts";
import type { PluginBackendMachine } from "./open-plugin-backend.ts";
import { openPluginService } from "./plugin-host.ts";
import { proxySetting } from "./proxy-setting.ts";
import { privateJournalFolder } from "./sandbox-journals.ts";
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
  /** The fenced sandbox the gate checks at every start; `srt` when left out. A test passes one whose check fails. */
  readonly fenced?: Sandbox;
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
  const gate = new RunnerStartGate({
    platform: process.platform,
    fenced: input.fenced ?? new SrtSandbox(undefined, undefined, privateJournalFolder(profile)),
    launcher: createHostSandbox(),
    runs: new UnfencedRuns({
      store: noUnfencedRunConsent,
      clock: systemClock,
      timers: nodeTimers,
    }),
    timers: nodeTimers,
  });
  const trust = cliTrustService(input.trust.trustStore, input.trust.clock);
  const made: string[] = [];
  return {
    workspace: new FileSystemFolderReader(input.dir.root, input.dir.shown),
    digest: webCryptoDigest,
    gate,
    runtime: {
      node: process.execPath,
      nodeFolder: runnerNodeFolder(process.execPath),
      runnerFile: runnerFile(),
    },
    transport:
      input.transport ??
      createNodeHttpClient({ hostClass: connectorHostClass, proxy: proxySetting }),
    // Read again at every start: what was checked when the command began is never reused.
    trustCheck: async () => {
      const read = await readWorkspaceTrust(input.dir, input.trust.commandSearch, input.workspace);
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
 * The machine for plugin backends on this computer: the integrations' gate,
 * runner and temp folders, so a plugin's backend starts exactly as a local
 * integration does, plus the profile's plugins folder, the plugin trust and
 * the plugin's saved settings.
 *
 * @throws RangeError when `HALONIC_HOME` or the home folder isn't absolute
 */
export function computerPluginMachine(
  integrations: LocalIntegrationMachine,
  input: Pick<ComputerIntegrationInput, "trust" | "environment">,
): PluginBackendMachine {
  const environment = input.environment ?? nodeProfileEnvironment();
  const service = openPluginService({ profile: environment, clock: input.trust.clock });
  return {
    gate: integrations.gate,
    runtime: integrations.runtime,
    transport: integrations.transport,
    runnerMachine: integrations.runnerMachine,
    plugins: new FileSystemFolderReader(pluginsFolder(profileFolder(environment))),
    digest: webCryptoDigest,
    trust: cliTrustService(input.trust.trustStore, input.trust.clock),
    settings: async (plugin) => await service.settings(plugin),
  };
}
