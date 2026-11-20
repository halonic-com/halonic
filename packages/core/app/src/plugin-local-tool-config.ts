// The connector config of one local tool of a trusted plugin, as
// `app.plugin-local-tool-config` asks (plugins ADR, section 4). Halonic builds
// it from the manifest as it was checked for this session, never from a
// second read of the folder, so the program, its arguments, its variables and
// its pin are what the person trusted. A script starts from the session's copy
// of the plugin, never from the plugin's own folder.

import type { Plugin, PluginLocalTool, PluginSettingValue } from "@halonicjs/format";
import type { ConnectorConfig } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import { type LocalToolSet, localToolConnectorId } from "./plugin-local-tools.ts";
import { pluginSecretNames } from "./plugin-secret-names.ts";
import type { PluginSettingValues } from "./plugin-settings.ts";
import { localToolPin } from "./plugin-trust.ts";

/** What {@link localToolConnectorConfig} builds one local tool's config from. */
export interface LocalToolConfigInput {
  /** The local tool, as the plugin's contributions give it. */
  readonly set: LocalToolSet;
  /** The plugin's manifest, as it was read and found trusted for this session. */
  readonly plugin: Plugin;
  /** The plugin's setting values, as `PluginSettings.values` gives them. */
  readonly settings: PluginSettingValues;
  /**
   * Where a file of the plugin is in the session's copy, as an absolute
   * path. `path` is the file's path in the plugin's folder, with `/`.
   */
  inCopy(path: string): string;
}

/**
 * Why a local tool has no config: a required setting it takes as a variable
 * has no value, such as when a new version of the plugin added it. The person
 * fills it in under the plugin's settings.
 */
export interface LocalToolSettingsNotSet {
  readonly kind: "settings-not-set";
  /** The settings' names, as `ui.settings` declares them, in the order `env` names them. */
  readonly settings: readonly string[];
}

/**
 * A local tool didn't start because a required setting it takes has no
 * value: what the host throws for {@link LocalToolSettingsNotSet}. The person
 * fills it in under the plugin's settings.
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

/**
 * The connector config to start one local tool with.
 *
 * - A script starts with its program (`node` or `python`) and the script's
 *   path in the session's copy, then the manifest's `args`.
 * - A package starts with its runner, `npx -y <name>` or `uvx <name>`, then
 *   the manifest's `args`, and the pin its trust record holds, so the
 *   adapter starts exactly that version from that registry.
 * - Each `env` variable that takes a setting gets the setting's value as
 *   text; an optional setting with no value is left out. Each one that takes
 *   a secret is in `secretEnv`, under the name the plugin's secret is kept
 *   under in `Secrets`; its value is read only when the program starts.
 * - The sites are the manifest's `network`.
 *
 * @throws when `set` isn't a local tool of `plugin`
 *
 * @example
 * const config = localToolConnectorConfig({
 *   set, plugin: trusted.plugin, settings: await settings.values(trusted.plugin),
 *   inCopy: (path) => join(copyFolder, ...path.split("/")),
 * });
 */
export function localToolConnectorConfig(
  input: LocalToolConfigInput,
): Result<ConnectorConfig, LocalToolSettingsNotSet> {
  const { set, plugin } = input;
  const localTool = localToolOf(set, plugin);
  const env = settingEnv(plugin, localTool, input.settings);
  if (!env.ok) return env;
  const { command, args } = startOf(localTool, input.inCopy);
  const pin = localToolPin(localTool);
  return ok({
    id: localToolConnectorId(set),
    transport: {
      kind: "stdio",
      command,
      args: [...args, ...localTool.args],
      env: env.value,
      sites: [...localTool.network],
      ...(pin === null ? {} : { pin }),
    },
    secretEnv: secretEnv(plugin, localTool),
  });
}

/** The manifest's entry for `set`. */
function localToolOf(set: LocalToolSet, plugin: Plugin): PluginLocalTool {
  const id = set.part.slice("local:".length);
  const localTool = plugin.localTools?.find((tool) => tool.id === id);
  if (set.plugin !== plugin.id || localTool === undefined) {
    throw new Error(`The plugin ${plugin.id} has no local tool "${localToolConnectorId(set)}".`);
  }
  return localTool;
}

/** The program and the arguments before the manifest's own. */
function startOf(
  localTool: PluginLocalTool,
  inCopy: (path: string) => string,
): { command: string; args: string[] } {
  const { script, package: start } = localTool.start;
  if (script !== undefined) return { command: script.program, args: [inCopy(script.path)] };
  if (start === undefined) {
    // The plugin kind refuses a local tool with neither, so only a manifest that skipped it gets here.
    throw new Error(`The local tool "${localTool.id}" names neither a package nor a script.`);
  }
  return start.runner === "npx"
    ? { command: "npx", args: ["-y", start.name] }
    : { command: "uvx", args: [start.name] };
}

/** The variables that take a setting, with its value as text. */
function settingEnv(
  plugin: Plugin,
  localTool: PluginLocalTool,
  settings: PluginSettingValues,
): Result<Record<string, string>, LocalToolSettingsNotSet> {
  const fields = plugin.ui?.settings ?? {};
  const env: Record<string, string> = {};
  const notSet: string[] = [];
  for (const [variable, value] of Object.entries(localTool.env)) {
    if (!("setting" in value)) continue;
    const setting = Object.hasOwn(settings, value.setting) ? settings[value.setting] : undefined;
    if (setting !== undefined) {
      env[variable] = settingText(setting);
    } else if (Object.hasOwn(fields, value.setting) && fields[value.setting]?.required === true) {
      notSet.push(value.setting);
    }
  }
  return notSet.length > 0 ? err({ kind: "settings-not-set", settings: notSet }) : ok(env);
}

/** The variables that take a secret, each with the name its value is kept under. */
function secretEnv(plugin: Plugin, localTool: PluginLocalTool): Record<string, string> {
  const names = pluginSecretNames(plugin);
  const env: Record<string, string> = {};
  for (const [variable, value] of Object.entries(localTool.env)) {
    if (!("secret" in value)) continue;
    const name = names[value.secret];
    if (name === undefined) {
      // The plugin kind refuses a secret the local tool doesn't declare.
      throw new Error(
        `The local tool "${localTool.id}" takes the secret ${value.secret}, which it doesn't declare.`,
      );
    }
    env[variable] = name;
  }
  return env;
}

/** A setting's value as a variable holds it: text as it is, a number or a yes/no as written. */
function settingText(value: PluginSettingValue): string {
  return typeof value === "string" ? value : String(value);
}
