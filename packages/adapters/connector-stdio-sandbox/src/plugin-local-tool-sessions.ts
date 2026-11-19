// What the host makes for each session of a plugin's local tool (HAL-12343,
// PR 4a). `PluginLocalTools` in `core/app` checks the person's trust and
// opens the session; this gives it the `prepare` that builds the session,
// and gives `SandboxStdioConnectorFactory` the `localTools` lookup that
// tells the connector where its program runs. Both come from one place, so
// the profile the session opens with is the one the connector checks.

import { join } from "node:path";
import type { LaunchFolders, RunnerSearch } from "@halonicjs/adapter-mcp";
import {
  type LocalToolOpening,
  type LocalToolSet,
  localToolConnectorConfig,
  localToolConnectorId,
  type PluginSettingValues,
  type TrustedPluginFolder,
} from "@halonicjs/app";
import type { Plugin, PluginLocalTool } from "@halonicjs/format";
import { type HttpClient, pluginSecrets, type Secrets } from "@halonicjs/ports";
import { type LocalToolPlace, localToolLaunch, type StdioConfig } from "./local-tool-launch.ts";
import { pinnedStart } from "./pinned-runner.ts";
import { readSecretEnv } from "./plan-launch.ts";
import { copyCheckedPlugin, type PluginCopyDisk, pluginCopyOnThisMachine } from "./plugin-copy.ts";
import { pluginLocalToolPlace } from "./plugin-local-tool-place.ts";
import type { LocalToolSetup } from "./sandbox-connector.ts";

/** What {@link PluginLocalToolSessions} needs from the host. */
export interface PluginLocalToolSessionsOptions {
  /** Where each session's working folder, temp folder and copy of the plugin are made, one new folder each. */
  readonly folders: LaunchFolders;
  /** Where a pinned package's runner is looked for. */
  readonly runners: RunnerSearch;
  /**
   * What the program may never reach: the person's credential folders, such
   * as SSH keys, and Halonic's profile and data folder, which holds every
   * plugin's folder.
   */
  readonly deniedPaths: readonly string[];
  /** The Halonic bridge, or `null` for none. */
  readonly bridge: LocalToolPlace["bridge"];
  /** The `PATH` the program gets: the host's own. */
  readonly path: string;
  /** How long one session may last, in milliseconds: Halonic's limit, never the plugin's. */
  readonly timeLimitMs: number;
  /** For the pin rules, which ask a pinned package's registry. */
  readonly http: HttpClient;
  /** Every secret Halonic keeps. Each plugin reads only its own (`pluginSecrets`). */
  readonly secrets: Secrets;
  /** The plugin's setting values, as `PluginSettings.values` gives them. */
  settings(plugin: Plugin): Promise<PluginSettingValues>;
  /** How the plugin's checked files are read and copied; the real disk unless given. */
  readonly disk?: PluginCopyDisk;
}

/**
 * A local tool didn't start because a required setting it takes has no
 * value. The person fills it in under the plugin's settings.
 */
export class LocalToolSettingsNotSetError extends Error {
  override readonly name = "LocalToolSettingsNotSetError";
  /** The settings' names, as the plugin's `ui.settings` declares them. */
  readonly settings: readonly string[];

  constructor(connectorId: string, settings: readonly string[]) {
    super(
      `Local tool "${connectorId}" doesn't start until these settings of its plugin are filled in: ${settings.join(", ")}.`,
    );
    this.settings = settings;
  }
}

/** The folder in a session's copy folder that holds the plugin's files. */
const copyName = "plugin";

/**
 * The sessions of the local tools of one plugin connector. Make one for each
 * connector the host creates, so two runs never share a session's setup:
 * the lookup knows one session per local tool at a time.
 *
 * For each session, {@link prepare}:
 *
 * - makes a new copy folder, checks the pin and finds its runner, then
 *   makes a new working folder and temp folder;
 * - copies the plugin's checked files into the copy, each only while its
 *   bytes still hash to what the trust check took (`copyCheckedPlugin`);
 * - builds the connector config from the manifest as it was checked
 *   (`localToolConnectorConfig`), the place (`pluginLocalToolPlace`) and the
 *   profile (`localToolLaunch`), with the plugin's own secrets;
 * - and gives a `release` that removes the three folders. Any failure on
 *   the way removes the folders made so far.
 *
 * @example
 * const sessions = new PluginLocalToolSessions({ folders, runners, deniedPaths, … });
 * const factory = new SandboxStdioConnectorFactory({ localTools: sessions.localTools, … });
 * const local = new PluginLocalTools({ sandbox, factory, context, startTrust, prepare: sessions.prepare });
 */
export class PluginLocalToolSessions {
  readonly #options: PluginLocalToolSessionsOptions;
  /** The setup of each local tool's current session, by connector id. */
  readonly #setups = new Map<string, LocalToolSetup>();

  constructor(options: PluginLocalToolSessionsOptions) {
    this.#options = options;
  }

  /** What the host set up for a local tool's current session, or `undefined` while it has none. */
  readonly localTools = (connectorId: string): LocalToolSetup | undefined =>
    this.#setups.get(connectorId);

  /**
   * Builds one session of `set` from the plugin as it was checked.
   *
   * @throws {@link LocalToolSettingsNotSetError} when a required setting has no value
   * @throws `PluginFileChangedError` when a file changed since the check
   * @throws when the pin breaks a rule, no runner was found or a secret isn't set
   */
  readonly prepare = async (
    set: LocalToolSet,
    trusted: TrustedPluginFolder,
  ): Promise<LocalToolOpening> => {
    const id = localToolConnectorId(set);
    const { folders } = this.#options;
    const made: string[] = [];
    const removeMade = async () => {
      await Promise.allSettled(made.map((folder) => folders.remove(folder)));
    };
    try {
      const copyFolder = await folders.create();
      made.push(copyFolder);
      const pluginCopy = join(copyFolder, copyName);
      const { config, stdio } = await this.#config(set, trusted, pluginCopy);
      const secrets = pluginSecrets(this.#options.secrets, set.plugin);
      const { pin, runner } = await pinnedStart(
        id,
        stdio,
        config.secretEnv,
        this.#options.http,
        this.#options.runners,
      );
      const workingFolder = await folders.create();
      made.push(workingFolder);
      const tempFolder = await folders.create();
      made.push(tempFolder);
      await copyCheckedPlugin(trusted.location, trusted.files, pluginCopy, this.#options.disk);
      const place = pluginLocalToolPlace(stdio, {
        workingFolder,
        tempFolder,
        pluginCopy,
        deniedPaths: this.#options.deniedPaths,
        bridge: this.#options.bridge,
        timeLimitMs: this.#options.timeLimitMs,
        path: this.#options.path,
        ...(runner === undefined ? {} : { runner }),
      });
      const secretEnv = await readSecretEnv(id, config.secretEnv, secrets);
      const { profile } = localToolLaunch(stdio, place, pin, secretEnv);
      const setup: LocalToolSetup = {
        place,
        tools: set.declared,
        callTimeoutMs: localToolOf(trusted.plugin, set).callTimeoutMs,
      };
      this.#setups.set(id, setup);
      const release = async () => {
        if (this.#setups.get(id) === setup) this.#setups.delete(id);
        await removeMade();
      };
      return { config, profile, release };
    } catch (error) {
      await removeMade();
      throw error;
    }
  };

  /** The connector config of `set`, starting a script from the session's copy at `pluginCopy`. */
  async #config(
    set: LocalToolSet,
    trusted: TrustedPluginFolder,
    pluginCopy: string,
  ): Promise<{ config: LocalToolOpening["config"]; stdio: StdioConfig }> {
    const built = localToolConnectorConfig({
      set,
      plugin: trusted.plugin,
      settings: await this.#options.settings(trusted.plugin),
      inCopy: (path) => join(pluginCopy, ...path.split("/")),
    });
    if (!built.ok) {
      throw new LocalToolSettingsNotSetError(localToolConnectorId(set), built.error.settings);
    }
    const config = built.value;
    if (config.transport.kind !== "stdio") {
      throw new Error(`Local tool "${config.id}" was built without a stdio transport.`);
    }
    return { config, stdio: config.transport };
  }
}

/** The manifest's entry for `set`; `localToolConnectorConfig` already refused a set the plugin doesn't have. */
function localToolOf(plugin: Plugin, set: LocalToolSet): PluginLocalTool {
  const id = set.part.slice("local:".length);
  const localTool = plugin.localTools?.find((tool) => tool.id === id);
  if (localTool === undefined) {
    throw new Error(`The plugin ${plugin.id} has no local tool "${localToolConnectorId(set)}".`);
  }
  return localTool;
}
