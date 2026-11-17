import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import {
  FileRecordStore,
  FileSystemFolderReader,
  FileTrustStore,
} from "@halonicjs/adapter-fs-node";
import { connectorHostClass } from "@halonicjs/adapter-http-kit";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import {
  type PluginBackendMachine,
  runnerFile,
  runnerNodeFolder,
  socketFolders,
  startRunner,
  systemFiles,
} from "@halonicjs/adapter-integration-runner";
import { createHostSandbox } from "@halonicjs/adapter-sandbox-host";
import { makeRunnerTempFolder, sandboxRuntimeFolder } from "@halonicjs/adapter-sandbox-srt";
import { PluginSettings, RunnerStartGate, TrustService, UnfencedRuns } from "@halonicjs/app";
import type { Sandbox, UnfencedRunConsentStore } from "@halonicjs/ports";
import {
  type ProfileFolder,
  pluginRecordsFolder,
  pluginsFolder,
  runnerTempFolder,
  sharedRunnerTempFolder,
  trustFolder,
} from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";

/** How long one runner may live, in milliseconds; a start after it asks the trust check and the gate again. */
const runnerTimeLimitMs = 10 * 60 * 1000;

/** A saved yes for running without the sandbox that is never there: the host has no way to ask for one. */
const noConsent: UnfencedRunConsentStore = {
  get: async () => null,
  save: async () => undefined,
  remove: async () => undefined,
};

/** The launcher's sandbox in name only: the gate only reaches it on the confirmed unfenced path, which the host never allows. */
function refusingLauncher(): Sandbox {
  return {
    ...createHostSandbox(),
    open: async () => {
      throw new Error("the agent host never runs a plugin without the sandbox");
    },
  };
}

/** What the host's plugin machine needs: the sandbox its sessions use, and where its files are. */
export interface HostPluginMachineOptions {
  /** The host's own fenced sandbox. */
  readonly fenced: Sandbox;
  readonly profile: ProfileFolder;
  readonly version: string;
  /** Removes a folder and everything in it; the host's own is `rm`. A test passes one that fails. */
  readonly removeFolder?: (folder: string) => Promise<void>;
  /** Where a failed removal is told, in the host's standard error. A test passes its own. */
  readonly log?: (text: string) => void;
  /** Starts one runner; the real one is `startRunner`. A test passes one whose runner stops on its own. */
  readonly start?: typeof startRunner;
}

/** The machine for plugin backends in the host, and the removal of the temp folders its starts made. */
export interface HostPluginMachine {
  readonly machine: PluginBackendMachine;
  /** Removes the temp folders of every start. Safe to call twice. */
  dispose(): Promise<void>;
}

/**
 * The CLI's plugin machine (`computerPluginMachine`) for the host, with the
 * differences that matter: the gate has no saved yes and no launcher that
 * opens, so a computer without the fenced sandbox starts nothing, and the
 * runner's read-only folder is the host executable's own folder, which stands
 * in for Node, not the wider folder two levels above it.
 */
export function hostPluginMachine(options: HostPluginMachineOptions): HostPluginMachine {
  const { profile } = options;
  const removeFolder =
    options.removeFolder ?? (async (folder) => await rm(folder, { recursive: true, force: true }));
  const log = options.log ?? ((text) => process.stderr.write(text));
  const start = options.start ?? startRunner;
  const made: string[] = [];
  const store = new FileTrustStore(trustFolder(profile));
  const digest = webCryptoDigest;
  const settings = new PluginSettings(
    new FileRecordStore(pluginRecordsFolder(profile)),
    systemClock,
  );
  const machine: PluginBackendMachine = {
    gate: new RunnerStartGate({
      platform: process.platform,
      fenced: options.fenced,
      launcher: refusingLauncher(),
      runs: new UnfencedRuns({ store: noConsent, clock: systemClock }),
    }),
    runtime: {
      node: process.execPath,
      nodeFolder: runnerNodeFolder(process.execPath),
      runnerFile: runnerFile(),
    },
    // The plugin's own sheet limits the hosts; a name leads to the internet, an address as written to its own class.
    transport: createNodeHttpClient({ hostClass: connectorHostClass }),
    // The start's temp folder goes when its runner stops, or when the start fails.
    startRunner: async (startOptions) => {
      const { tempFolder } = startOptions.machine;
      const removeTemp = async () => {
        const index = made.indexOf(tempFolder);
        if (index !== -1) made.splice(index, 1);
        await removeFolder(tempFolder);
      };
      // A failed removal is logged without its path and never thrown: after a stop nothing awaits it,
      // and on a failed start it would hide the start's own error.
      const removeTempAndLog = async () => {
        try {
          await removeTemp();
        } catch (error) {
          log(
            `The agent host could not remove a plugin runner's temp folder: ${errorText(error)}\n`,
          );
        }
      };
      const runner = await start(startOptions).catch(async (error: unknown) => {
        await removeTempAndLog();
        throw error;
      });
      void runner.stopped.then(removeTempAndLog, removeTempAndLog);
      return runner;
    },
    runnerMachine: async () => {
      const tempFolder = await makeRunnerTempFolder(
        {
          privateParent: runnerTempFolder(profile),
          sharedParent: sharedRunnerTempFolder(profile),
        },
        { log },
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
    plugins: new FileSystemFolderReader(pluginsFolder(profile)),
    digest,
    trust: new TrustService({ store, digest, clock: systemClock, appVersion: options.version }),
    settings: async (plugin) => await settings.values(plugin),
  };
  const dispose = async () => {
    await Promise.all(made.splice(0).map(removeFolder));
  };
  return { machine, dispose };
}

/** The reason of a failure, with no path of ours added; `rm` errors carry the path, so only the code is kept. */
function errorText(error: unknown): string {
  const code = error instanceof Error && "code" in error ? String(error.code) : undefined;
  return code ?? "unknown error";
}

const webCryptoDigest = {
  async sha256(data: Uint8Array): Promise<Uint8Array> {
    // A copy on its own ArrayBuffer: Web Crypto refuses views of a SharedArrayBuffer.
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};
