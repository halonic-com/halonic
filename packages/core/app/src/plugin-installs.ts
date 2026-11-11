// Where each added plugin came from, as `app.plugin-add` asks: the plugin
// service keeps one install record per plugin id in the profile's records,
// so `halonic plugin list` can show the source, and removing a plugin whose
// folder is no longer readable still knows its secret names (HAL-1736 plan,
// steps 4 and "How remove works").

import { type Clock, foldRecords, type RecordStore } from "@halonicjs/ports";
import type { PluginFileHash } from "./plugin-trust-content.ts";

/** The collection that holds every added plugin's install record. */
export const pluginInstallsCollection = "plugin-installs";

/** Where a plugin was added from. */
export type PluginSource =
  | {
      readonly kind: "folder";
      /** The folder's path as the person gave it, resolved. */
      readonly path: string;
    }
  | {
      readonly kind: "git";
      /** The git address as the person gave it. */
      readonly address: string;
      /** The full commit id the plugin was exported from. */
      readonly commit: string;
    };

/** What was added, from where and when. */
export interface PluginInstall {
  readonly source: PluginSource;
  /** When it was added, as an ISO 8601 time. */
  readonly addedAt: string;
  /** Every file placed and the SHA-256 of its bytes, sorted by path. */
  readonly files: readonly PluginFileHash[];
  /** The name each declared secret is kept under in `Secrets`, by declared name. */
  readonly secretNames: Readonly<Record<string, string>>;
}

/**
 * Reads, saves and deletes install records.
 *
 * @example
 * const installs = new PluginInstalls(records, clock);
 * await installs.save("weather", { source, files, secretNames });
 * (await installs.get("weather"))?.source; // { kind: "folder", path: "<home>/weather" }
 */
export class PluginInstalls {
  readonly #store: RecordStore;
  readonly #clock: Clock;

  constructor(store: RecordStore, clock: Clock) {
    this.#store = store;
    this.#clock = clock;
  }

  /** Saves the install record of the plugin `id` in place of any earlier one, dated now. */
  async save(id: string, install: Omit<PluginInstall, "addedAt">): Promise<void> {
    const at = this.#clock.now().toISOString();
    const values: PluginInstall = { ...install, addedAt: at };
    await this.#store.append([
      { at, collection: pluginInstallsCollection, id, op: "add", values: { ...values } },
    ]);
  }

  /** The install record of the plugin `id`, or `null` when it has none or it can't be read. */
  async get(id: string): Promise<PluginInstall | null> {
    const records = foldRecords(await this.#store.changes(pluginInstallsCollection));
    const values = records.get(id)?.values;
    return values !== undefined && isPluginInstall(values) ? values : null;
  }

  /** Deletes the install record of the plugin `id`, and compacts the collection. */
  async forget(id: string): Promise<void> {
    if (!foldRecords(await this.#store.changes(pluginInstallsCollection)).has(id)) return;
    await this.#store.append([
      {
        at: this.#clock.now().toISOString(),
        collection: pluginInstallsCollection,
        id,
        op: "remove",
        values: null,
      },
    ]);
    await this.#store.compact(pluginInstallsCollection);
  }
}

/** Whether saved values are an install record, so one written by hand or damaged reads as none. */
function isPluginInstall(values: unknown): values is PluginInstall {
  if (!isObject(values)) return false;
  const { source, addedAt, files, secretNames } = values;
  return (
    isSource(source) &&
    typeof addedAt === "string" &&
    Array.isArray(files) &&
    files.every(isFileHash) &&
    isStringRecord(secretNames)
  );
}

function isSource(value: unknown): value is PluginSource {
  if (!isObject(value)) return false;
  const { kind, path, address, commit } = value;
  if (kind === "folder") return typeof path === "string";
  if (kind === "git") return typeof address === "string" && typeof commit === "string";
  return false;
}

function isFileHash(value: unknown): value is PluginFileHash {
  if (!isObject(value)) return false;
  const { path, sha256 } = value;
  return typeof path === "string" && typeof sha256 === "string";
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isObject(value) && Object.values(value).every((item) => typeof item === "string");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
