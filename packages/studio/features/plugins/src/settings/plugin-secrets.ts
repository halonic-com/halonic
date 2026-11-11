import type { Plugin } from "@halonicjs/format";

/**
 * Where Studio writes a plugin's secrets: the keychain, through the shell.
 * `TauriSecrets` has this shape. `remove` succeeds when nothing is stored.
 */
export interface PluginSecretWriter {
  set(name: string, value: string): Promise<void>;
  remove(name: string): Promise<void>;
}

/** Why one setting value wasn't saved. */
export interface PluginSettingProblem {
  /** The setting's name, as `ui.settings` declares it. */
  readonly setting: string;
  /** For the person: what to use instead. */
  readonly message: string;
}

/** The part of `PluginService` from `@halonicjs/app` that saving and removing use. */
export interface PluginSettingsHost {
  saveSettings(
    plugin: Plugin,
    values: Readonly<Record<string, unknown>>,
  ): Promise<
    { readonly ok: true } | { readonly ok: false; readonly error: readonly PluginSettingProblem[] }
  >;
  secretNames(plugin: Plugin): Record<string, string>;
  forget(id: string): Promise<void>;
}

/** A secret the writer couldn't save or delete. */
export interface PluginSecretFailure {
  /** The secret's name, as the plugin declares it. */
  readonly secret: string;
  /** What the writer threw; its message never holds the value. */
  readonly error: unknown;
}

/** What saving a plugin's settings did. */
export type SaveSettingsOutcome =
  /** The settings that aren't secrets didn't fit, so nothing was saved. */
  | { readonly kind: "refused"; readonly problems: readonly PluginSettingProblem[] }
  /** The settings were saved, and every secret except those in `failed`. */
  | { readonly kind: "saved"; readonly failed: readonly PluginSecretFailure[] };

/**
 * Saves the values of a plugin's settings section. A `secret` setting's
 * value goes to the writer under the plugin's own name for that secret,
 * `plugin__<id>__<secret>`, never the name it declares; an empty one keeps
 * what is stored. The other values go to the host, and when they don't fit,
 * no secret is written either.
 *
 * @param values - the section's values, by setting name
 *
 * @example
 * const saved = await savePluginSettings(service, keychain, plugin, { city: "Oslo", key: "abc" });
 * if (saved.kind === "refused") showProblems(saved.problems);
 */
export async function savePluginSettings(
  host: PluginSettingsHost,
  writer: PluginSecretWriter,
  plugin: Plugin,
  values: Readonly<Record<string, unknown>>,
): Promise<SaveSettingsOutcome> {
  const fields = plugin.ui?.settings ?? {};
  const plain: Record<string, unknown> = {};
  const secrets: [secret: string, value: string][] = [];
  for (const [setting, value] of Object.entries(values)) {
    const field = Object.hasOwn(fields, setting) ? fields[setting] : undefined;
    if (field?.type !== "secret") {
      plain[setting] = value;
    } else if (typeof value === "string" && value !== "") {
      secrets.push([field.secret, value]);
    }
  }
  const saved = await host.saveSettings(plugin, plain);
  if (!saved.ok) {
    return { kind: "refused", problems: saved.error };
  }
  const names = host.secretNames(plugin);
  const failed: PluginSecretFailure[] = [];
  for (const [secret, value] of secrets) {
    const name = names[secret];
    try {
      if (name === undefined) throw new RangeError("The plugin doesn't declare this secret.");
      await writer.set(name, value);
    } catch (error) {
      failed.push({ secret, error });
    }
  }
  return { kind: "saved", failed };
}

/**
 * Deletes what Studio keeps for a plugin, for Remove: every secret under
 * the plugin's own names, then its setting values. A secret that can't be
 * deleted doesn't stop the rest, and is returned so Studio can name it.
 *
 * @returns the secrets that are still stored
 */
export async function forgetPlugin(
  host: PluginSettingsHost,
  writer: PluginSecretWriter,
  plugin: Plugin,
): Promise<readonly PluginSecretFailure[]> {
  const failed: PluginSecretFailure[] = [];
  for (const [secret, name] of Object.entries(host.secretNames(plugin))) {
    try {
      await writer.remove(name);
    } catch (error) {
      failed.push({ secret, error });
    }
  }
  await host.forget(plugin.id);
  return failed;
}
