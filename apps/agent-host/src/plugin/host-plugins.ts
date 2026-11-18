import { isSea } from "node:sea";

import { FileUnfencedRunConsentStore } from "@halonicjs/adapter-fs-node";
import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import { MemoryTokenStore } from "@halonicjs/adapter-memory";
import { createHostSandbox } from "@halonicjs/adapter-sandbox-host";
import type { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { RunnerStartGate, type SaveTimers, UnfencedRuns } from "@halonicjs/app";
import type { Sandbox } from "@halonicjs/ports";
import { type ProfileFolder, unfencedRunsFolder } from "@halonicjs/profile";
import { systemClock } from "@halonicjs/std";
import { proxySetting } from "../proxy-setting.ts";
import type { HostRoute } from "../server/host-server.ts";
import { hostPluginBackends, unavailablePluginBackends } from "./host-plugin-backends.ts";
import { hostPluginMachine } from "./host-plugin-machine.ts";
import { pluginRoutes } from "./plugin-routes.ts";
import { PluginSecretValues } from "./plugin-secret-values.ts";
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
 * The table of plugin runners, started in the host's own sandbox, or without
 * it only with the user's yes for the reason at that start. `stop` stops
 * every runner and removes the temp folders of their starts.
 *
 * The shipped single executable runs no plugin, but it builds the same gate
 * and saved yes, so the `/v1/unfenced-runs` routes answer alike in both builds.
 */
export function hostPlugins(
  version: string,
  sandbox: SrtSandbox,
  profile: ProfileFolder | undefined,
): HostPlugins | undefined {
  if (profile === undefined) return undefined;
  const secretValues = new PluginSecretValues();
  const unfenced = hostUnfencedRuns(sandbox, profile);
  if (isSea()) {
    return {
      table: new PluginTable(unavailablePluginBackends()),
      secretValues,
      unfenced,
      stop: async () => undefined,
    };
  }
  const { machine, dispose } = hostPluginMachine({ gate: unfenced.gate, profile, version });
  // A backend reads only the secrets Studio handed over for its plugin, and no sign-in token yet.
  const context = {
    secrets: secretValues.secrets,
    tokens: new MemoryTokenStore(),
    http: createNodeHttpClient({ hostClass: () => "public", proxy: proxySetting }),
    trust: null,
  };
  const table = new PluginTable(hostPluginBackends(machine, context, logToError), {
    secretValues,
  });
  return {
    table,
    secretValues,
    unfenced,
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
  ];
}

function logToError(text: string): void {
  process.stderr.write(text);
}
