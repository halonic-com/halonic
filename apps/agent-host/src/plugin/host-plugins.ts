import { homedir } from "node:os";
import { isSea } from "node:sea";

import { pluginLocalToolsSource } from "@halonicjs/adapter-connector-stdio-sandbox";
import { FileUnfencedRunConsentStore } from "@halonicjs/adapter-fs-node";
import { homeDeniedPaths, realPathOnDisk } from "@halonicjs/adapter-harness-kit";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import { createRunnerSearch, nodeLaunchFolders } from "@halonicjs/adapter-mcp";
import { MemoryTokenStore } from "@halonicjs/adapter-memory";
import { createHostSandbox } from "@halonicjs/adapter-sandbox-host";
import type { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { RunnerStartGate, type SaveTimers, UnfencedRuns } from "@halonicjs/app";
import type { SignInIntegration } from "@halonicjs/host-integration-sign-in";
import type { Sandbox, SignInTokens } from "@halonicjs/ports";
import { type ProfileFolder, unfencedRunsFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { proxySetting } from "../proxy-setting.ts";
import type { HostRoute } from "../server/host-server.ts";
import { hostPluginBackends, unavailablePluginBackends } from "./host-plugin-backends.ts";
import { hostPluginMachine, runnerTimeLimitMs } from "./host-plugin-machine.ts";
import { pluginRoutes } from "./plugin-routes.ts";
import { pluginRunStateRoutes } from "./plugin-run-state-routes.ts";
import { PluginRunStates } from "./plugin-run-states.ts";
import { PluginSecretValues } from "./plugin-secret-values.ts";
import { pluginSignIns } from "./plugin-sign-ins.ts";
import { PluginTable } from "./plugin-table.ts";
import { type UnfencedRunsSource, unfencedRunsRoutes } from "./unfenced-runs-routes.ts";

/**
 * Node's timers for a start's time limit, and for reading the saved yes again
 * while runs without the sandbox are running, so a Take back in another
 * process (the CLI) stops them.
 */
const nodeTimers: SaveTimers = {
  set: (callback, delayMs) => setTimeout(callback, delayMs).unref(),
  clear: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

/** The host's plugins: their runners, the secrets Studio handed over for them, and the yes for running without the sandbox. */
export interface HostPlugins {
  readonly table: PluginTable;
  /** Kept in memory only; the backends read them, and `POST /v1/plugins/secrets` replaces them. */
  readonly secretValues: PluginSecretValues;
  readonly unfenced: UnfencedRunsSource;
  /** Which plugins' runners stopped because the sandbox failed, for the plugin page's R15. */
  readonly runStates: PluginRunStates;
  /** The sign-ins of the plugin called `name`, for the host's sign-ins; `undefined` where no plugin runs. */
  signIns(name: string): SignInIntegration | undefined;
  /** Stops every runner, drops the secrets and removes the temp folders of the starts. */
  stop(): Promise<void>;
}

/**
 * The host's one start gate, with the saved yes in the profile, the same file
 * the CLI reads. Every plugin start and the `/v1/unfenced-runs` routes share
 * it, so Take back stops the runners this host started. The CLI's own runs
 * read the file again at their next start.
 */
export function hostUnfencedRuns(
  fenced: Sandbox,
  profile: ProfileFolder,
): UnfencedRunsSource & {
  readonly gate: RunnerStartGate;
} {
  const runs = new UnfencedRuns({
    store: new FileUnfencedRunConsentStore(unfencedRunsFolder(profile)),
    clock: systemClock,
    timers: nodeTimers,
  });
  const gate = new RunnerStartGate({
    platform: process.platform,
    fenced,
    launcher: createHostSandbox(),
    runs,
    timers: nodeTimers,
  });
  return { gate, runs };
}

/**
 * The table of plugin runners and local tool sessions. A runner starts in the
 * host's own sandbox, or without it only with the user's yes for the reason
 * at that start; a local tool always starts in the sandbox. `stop` stops
 * every runner and session and removes the temp folders of their starts.
 *
 * @param signInTokens - the host's sign-in tokens for a plugin, which its backend places
 *
 * The shipped single executable runs no plugin, but it builds the same gate
 * and saved yes, so the `/v1/unfenced-runs` routes answer alike in both builds.
 */
export function hostPlugins(
  version: string,
  sandbox: SrtSandbox,
  profile: ProfileFolder | undefined,
  signInTokens: (plugin: string) => SignInTokens | undefined,
): HostPlugins | undefined {
  if (profile === undefined) return undefined;
  const secretValues = new PluginSecretValues();
  const unfenced = hostUnfencedRuns(sandbox, profile);
  const runStates = new PluginRunStates(systemClock);
  if (isSea()) {
    return {
      table: new PluginTable(unavailablePluginBackends()),
      secretValues,
      unfenced,
      runStates,
      signIns: () => undefined,
      stop: async () => undefined,
    };
  }
  const { machine, dispose } = hostPluginMachine({
    gate: unfenced.gate,
    profile,
    version,
    onStart: runStates.started,
  });
  // A backend reads only the secrets Studio handed over for its plugin, and its own sign-ins' access tokens.
  const context = {
    secrets: secretValues.secrets,
    tokens: new MemoryTokenStore(),
    signInTokens,
    http: createNodeHttpClient({ hostClass: () => "public", proxy: proxySetting }),
    trust: null,
  };
  // Each local tool runs in a sandbox session of its own, from a copy of the files the person trusted,
  // and never reaches the person's credential folders or Halonic's profile, which holds every plugin.
  const localTools = pluginLocalToolsSource({
    sandbox,
    folders: nodeLaunchFolders,
    runners: createRunnerSearch(process.env),
    deniedPaths: async () => [
      profile.root,
      ...(await homeDeniedPaths(homedir(), process.platform, { realPath: realPathOnDisk })),
    ],
    // The host gives a local tool no Halonic bridge yet, as the CLI doesn't.
    bridge: null,
    path: process.env["PATH"] ?? "",
    timeLimitMs: runnerTimeLimitMs,
    clientInfo: { name: "halonic", version },
    startTrust: { plugins: machine.plugins, digest: machine.digest, trust: machine.trust },
    settings: (plugin) => machine.settings(plugin),
    onReleaseFailed: (error) =>
      logToError(
        `The agent host could not remove a local tool's session folders (${errorName(error)}).\n`,
      ),
  });
  const table = new PluginTable(hostPluginBackends(machine, context, localTools, logToError), {
    secretValues,
  });
  return {
    table,
    secretValues,
    unfenced,
    runStates,
    signIns: pluginSignIns({ machine, secrets: secretValues.secrets, log: logToError }),
    stop: async () => {
      await table.closeAll();
      await dispose();
    },
  };
}

/** The plugin routes: none without a profile folder, as there are no plugins then. */
export function hostPluginRoutes(
  plugins: HostPlugins | undefined,
  log: (text: string) => void,
): HostRoute[] {
  if (plugins === undefined) return [];
  return [
    ...pluginRoutes({ plugins: plugins.table, secretValues: plugins.secretValues, log }),
    ...unfencedRunsRoutes(plugins.unfenced, log),
    ...pluginRunStateRoutes(plugins.runStates),
  ];
}

function logToError(text: string): void {
  process.stderr.write(text);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}
