// Opens a plugin's backend for a run (HAL-8089), through the same runner as a
// local integration. Every start of its runner, the first and each one after
// an idle stop, reads the plugin folder again, checks the person's trust in
// the plugin against what is in it (`PluginBackendStart`) and asks the gate
// again, so a plugin changed while the run goes loses its trust at the next
// start and nothing runs. The plugin's code never loads here: it runs in the
// runner, and a start the gate doesn't allow starts nothing, with no
// in-process fallback.

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  checkedFilesProblems,
  integrationConnectorClient,
  type LocalRunnerBridge,
  loadPluginBackend,
  type RunnerConnection,
  type StartedRunner,
  startRunner,
} from "@halonicjs/adapter-integration-runner";
import {
  PluginBackendNotTrustedError,
  PluginBackendStart,
  type PluginSettingValues,
  pluginBackendChoices,
  readPluginFolder,
  type TrustedPluginBackend,
  type TrustService,
} from "@halonicjs/app";
import type { Plugin } from "@halonicjs/format";
import type { ConnectorClient, Digest, FolderReader } from "@halonicjs/ports";
import type { LocalIntegrationMachine } from "./open-local-integration.ts";
import type { OpenPluginBackend, OpenPluginBackendRequest } from "./plugin-connector-factory.ts";

/**
 * What opening a plugin's backend uses on this computer. The gate, the
 * runner's files, the transport and the temp folders are a local
 * integration's, so both start the same way.
 */
export interface PluginBackendMachine
  extends Pick<
    LocalIntegrationMachine,
    "gate" | "runtime" | "transport" | "runnerMachine" | "runnerExists" | "startRunner"
  > {
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
