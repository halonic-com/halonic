// Opens a plugin's backend (HAL-8089, HAL-9389), through the same runner as a
// local integration. The `halonic` command and the desktop agent host both use it. Every start of its runner, the first and each one after
// an idle stop, reads the plugin folder again, checks the person's trust in
// the plugin against what is in it (`PluginBackendStart`) and asks the gate
// again, so a plugin changed while the run goes loses its trust at the next
// start and nothing runs. The plugin's code never loads here: it runs in the
// runner, and a start the gate doesn't allow starts nothing, with no
// in-process fallback.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AddressCheckingHttpClient } from "@halonicjs/adapter-http-kit";
import {
  PluginBackendNotTrustedError,
  PluginBackendStart,
  type PluginSettingValues,
  pluginBackendChoices,
  type RunnerStartGate,
  readPluginFolder,
  type TrustedPluginBackend,
  type TrustService,
} from "@halonicjs/app";
import type { Plugin } from "@halonicjs/format";
import type {
  ConnectorClient,
  ConnectorFactoryContext,
  Digest,
  FolderReader,
} from "@halonicjs/ports";
import { checkedFilesProblems } from "./checked-files.ts";
import type { RunnerConnection } from "./connect-runner.ts";
import { integrationConnectorClient } from "./integration-connector-client.ts";
import type { LocalRunnerBridge } from "./local-integration.ts";
import { loadPluginBackend } from "./plugin-backend.ts";
import type { RunnerFiles, RunnerMachine } from "./runner-profile.ts";
import { type StartedRunner, startRunner } from "./start-runner.ts";

/** What opening a plugin's backend is asked for. */
export interface OpenPluginBackendRequest {
  /** The connector's id in the workspace, as a hub names it. */
  readonly id: string;
  /** The plugin's id, which is its folder's name in the profile's plugins folder. */
  readonly plugin: string;
  readonly context: ConnectorFactoryContext;
}

/**
 * Opens a plugin's backend in the runner and returns its client.
 *
 * @throws when nothing started, such as a plugin that isn't trusted or changed since, or a fence that failed
 */
export type OpenPluginBackend = (request: OpenPluginBackendRequest) => Promise<ConnectorClient>;

/**
 * What opening a plugin's backend uses on this computer. The gate, the
 * runner's files, the transport and the temp folders are a local
 * integration's, so both start the same way.
 */
export interface PluginBackendMachine {
  /** Picks the sandbox the runner starts in, at every start. */
  readonly gate: RunnerStartGate;
  /** Node and the built runner. */
  readonly runtime: Omit<RunnerFiles, "integrationFolder">;
  /** What the runner's requests go out through; the plugin's own sheet limits the hosts. */
  readonly transport: AddressCheckingHttpClient;
  /** What one runner start needs from this computer; a fresh temp folder each time. */
  runnerMachine(): Promise<RunnerMachine>;
  /** Whether the built runner is there; this computer's disk unless a test says otherwise. */
  runnerExists?(file: string): boolean;
  /** Starts a runner in the sandbox the gate picked; `startRunner` unless a test says otherwise. */
  startRunner?: typeof startRunner;
  /** The profile's plugins folder, read without following links. */
  readonly plugins: FolderReader;
  /** The hash the trust check uses. */
  readonly digest: Digest;
  /** The trust the person gave plugins. */
  readonly trust: Pick<TrustService, "checkPlugin">;
  /** The plugin's saved setting values; defaults where none are saved. */
  settings(plugin: Plugin): Promise<PluginSettingValues>;
}

/**
 * The opener the `plugin` connector factory is given. The backend runs the
 * plugin's `backend.entry` and uses its `default` export.
 *
 * @example
 * new PluginConnectorFactory(openPluginBackend(machine));
 */
export function openPluginBackend(machine: PluginBackendMachine): OpenPluginBackend {
  return async (request) => await new PluginBackendOpening(machine, request).open();
}

class PluginBackendOpening {
  readonly #machine: PluginBackendMachine;
  readonly #request: OpenPluginBackendRequest;

  constructor(machine: PluginBackendMachine, request: OpenPluginBackendRequest) {
    this.#machine = machine;
    this.#request = request;
  }

  async open(): Promise<ConnectorClient> {
    const { id, plugin: pluginId, context } = this.#request;
    const { plugins, digest, trust, gate } = this.#machine;
    const starts = new PluginBackendStart({ plugins, digest, trust, gate });
    const read = await readPluginFolder(plugins, digest, pluginId);
    if (!read.ok) throw new Error(read.error.map((problem) => problem.message).join(" "));
    const { plugin, location, files } = read.value;
    const loaded = await loadPluginBackend({
      plugin,
      files,
      folder: location,
      start: (bridge) => this.#start(starts, plugin, bridge),
      transport: this.#machine.transport,
      secrets: context.secrets,
      tokens: context.tokens,
      choices: pluginBackendChoices(plugin, await this.#machine.settings(plugin)),
    });
    if (!loaded.ok) {
      throw new Error(loaded.error.map((problem) => problem.message).join("; "));
    }
    return integrationConnectorClient({ id, loaded: loaded.value });
  }

  async #start(
    starts: PluginBackendStart,
    readPlugin: Plugin,
    bridge: LocalRunnerBridge,
  ): Promise<RunnerConnection> {
    const { runtime, runnerExists = existsSync, startRunner: begin = startRunner } = this.#machine;
    if (!runnerExists(runtime.runnerFile)) {
      throw new Error("the integration runner isn't built");
    }
    const runnerMachine = await this.#machine.runnerMachine();
    const gated = await starts.start(
      this.#request.plugin,
      (sandbox, trusted, backend): Promise<StartedRunner> => {
        this.#requireReadPlugin(trusted, readPlugin);
        this.#requireTrustedFiles(trusted);
        return begin({
          sandbox,
          files: { ...runtime, integrationFolder: trusted.location },
          entry: {
            file: join(trusted.location, readPlugin.backend?.entry ?? ""),
            exportName: "default",
          },
          machine: { ...runnerMachine, backend },
          settings: bridge.settings,
          tools: bridge.tools,
          http: bridge.http,
          secrets: bridge.secrets,
        });
      },
    );
    if (gated.run === "fenced" || gated.run === "unfenced") return gated.runner;
    throw new Error(
      gated.run === "needs-yes"
        ? `the sandbox isn't available here (${gated.reason}) and running without it isn't allowed yet`
        : "the sandbox failed its check, so nothing runs",
    );
  }

  /**
   * The sheet the loader enforces came from the first read. At every start
   * the plugin the person trusted must be that plugin, so a manifest edited
   * before the read and put back, or trusted again afterwards, can't set the
   * runner's hosts and secrets.
   */
  #requireReadPlugin(trusted: TrustedPluginBackend, readPlugin: Plugin): void {
    if (JSON.stringify(trusted.plugin) !== JSON.stringify(readPlugin)) {
      throw new Error(
        `The plugin ${this.#request.plugin} changed after this run began, so its backend doesn't restart. Start the run again.`,
      );
    }
  }

  /**
   * The folder must still hold the files the trust check hashed, checked
   * right before the runner starts, so the time between the check and the
   * runner's load is as short as it can be here. The runner still loads the
   * folder in place, so a change inside that last moment isn't closed by this.
   */
  #requireTrustedFiles(trusted: TrustedPluginBackend): void {
    const problems = checkedFilesProblems(trusted.location, trusted.files);
    if (problems.length > 0) {
      throw new PluginBackendNotTrustedError(this.#request.plugin, "changed");
    }
  }
}
