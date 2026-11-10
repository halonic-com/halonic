// A plugin's setting values, as `app.plugin-settings` asks: kept in the
// profile's `RecordStore`, one record per plugin keyed by its id (ADR
// 2026-11-09-plugins, section 3). Only removing the plugin deletes them
// (HAL-1803); a `secret` setting's value goes to `Secrets`, never here.

import {
  type Plugin,
  type PluginSettingField,
  type PluginSettingValue,
  settingValueProblem,
} from "@halonicjs/format";
import { type Clock, foldRecords, type RecordStore } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";

/** The collection that holds every plugin's setting values. */
export const pluginSettingsCollection = "plugin-settings";

/** Why one setting value wasn't saved. */
export interface PluginSettingProblem {
  /** The setting's name, as `ui.settings` declares it. */
  readonly setting: string;
  /** For the person: what to use instead. */
  readonly message: string;
}

/** A plugin's setting values, by setting name. */
export type PluginSettingValues = Record<string, PluginSettingValue>;

/**
 * Reads, saves and deletes the setting values of plugins.
 *
 * @example
 * const settings = new PluginSettings(records, clock);
 * await settings.save(plugin, { root: "~/Documents" });
 * await settings.values(plugin); // { root: "~/Documents" }
 */
export class PluginSettings {
  readonly #store: RecordStore;
  readonly #clock: Clock;

  constructor(store: RecordStore, clock: Clock) {
    this.#store = store;
    this.#clock = clock;
  }

  /**
   * The value of each setting the plugin declares now: the saved one when
   * it still fits the setting, otherwise its `default`. A setting with
   * neither, and every `secret` setting, is left out. A saved value for a
   * setting the plugin no longer declares is kept, but not given.
   */
  async values(plugin: Plugin): Promise<PluginSettingValues> {
    const saved = await this.#saved(plugin.id);
    const values: PluginSettingValues = {};
    for (const [name, field] of settingFields(plugin)) {
      const value = saved[name];
      if (value !== undefined && settingValueProblem(field, value) === null) {
        values[name] = value as PluginSettingValue;
      } else if (field.type !== "secret" && field.default !== undefined) {
        values[name] = field.default;
      }
    }
    return values;
  }

  /**
   * Saves `values` in place of the plugin's saved values, only when every
   * one fits a setting the plugin declares and every required setting has a
   * value or a `default`. Otherwise nothing is saved.
   *
   * @returns every problem found, when nothing was saved
   */
  async save(
    plugin: Plugin,
    values: Readonly<Record<string, unknown>>,
  ): Promise<Result<void, PluginSettingProblem[]>> {
    const problems = settingProblems(plugin, values);
    if (problems.length > 0) return err(problems);
    await this.#store.append([
      {
        at: this.#clock.now().toISOString(),
        collection: pluginSettingsCollection,
        id: plugin.id,
        op: "add",
        values: definedValues(values),
      },
    ]);
    return ok(undefined);
  }

  /**
   * Deletes the setting values of the plugin `id`, and compacts the
   * collection so the old values leave the storage too.
   */
  async forget(id: string): Promise<void> {
    if (!foldRecords(await this.#store.changes(pluginSettingsCollection)).has(id)) return;
    await this.#store.append([
      {
        at: this.#clock.now().toISOString(),
        collection: pluginSettingsCollection,
        id,
        op: "remove",
        values: null,
      },
    ]);
    await this.#store.compact(pluginSettingsCollection);
  }

  async #saved(id: string): Promise<Readonly<Record<string, unknown>>> {
    const records = foldRecords(await this.#store.changes(pluginSettingsCollection));
    return records.get(id)?.values ?? {};
  }
}

function settingFields(plugin: Plugin): [string, PluginSettingField][] {
  return Object.entries(plugin.ui?.settings ?? {});
}

/** Every problem with `values`: an unknown setting, a value that doesn't fit, a required one missing. */
function settingProblems(
  plugin: Plugin,
  values: Readonly<Record<string, unknown>>,
): PluginSettingProblem[] {
  const fields = new Map(settingFields(plugin));
  const problems: PluginSettingProblem[] = [];
  for (const [setting, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const field = fields.get(setting);
    const message =
      field === undefined
        ? `${plugin.name} has no setting called '${setting}'`
        : settingValueProblem(field, value);
    if (message !== null) problems.push({ setting, message });
  }
  for (const [setting, field] of fields) {
    const missing =
      values[setting] === undefined && !("default" in field && field.default !== undefined);
    if (field.required && field.type !== "secret" && missing) {
      problems.push({ setting, message: "fill this in: it is required" });
    }
  }
  return problems;
}

/** `values` without the names whose value is `undefined`, which mean "not set". */
function definedValues(values: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}
