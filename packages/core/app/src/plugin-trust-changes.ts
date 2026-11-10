// What changed in a plugin since a person trusted it, as
// `app.plugin-trust-changes` asks (P2 plan section 4). Unlike a workspace,
// a plugin's record never shrinks by itself: a removed tool or file is a
// change too, because what is left may now behave differently. So this only
// says what changed, for the prompt; the fingerprint decides.

import { deepEqual } from "@halonicjs/std";
import {
  hostKey,
  type PluginFileHash,
  type PluginHostContent,
  type PluginLocalToolContent,
  type PluginSecretContent,
  type PluginToolContent,
  type PluginTrustContent,
  partKey,
} from "./plugin-trust-content.ts";

/** What changed in one list of the content, matched by a key. */
export interface PluginItemChanges<Item> {
  added: Item[];
  /** Items in both whose content differs, with the fields that differ, sorted. */
  changed: { before: Item; after: Item; fields: string[] }[];
  removed: Item[];
}

/** What changed in the plugin folder's files, by path, each list sorted. */
export interface PluginFileChanges {
  added: string[];
  changed: string[];
  removed: string[];
}

/**
 * What changed between the content a person trusted and the current one,
 * by section, in the order the prompt shows them. `readable: false` means
 * the record's content isn't plugin content (it was edited by hand, or
 * written by another version), so the prompt can only say that something
 * changed.
 */
export type PluginTrustChanges =
  | { readable: false }
  | {
      readable: true;
      /** The fields of the plugin's id, version, sdk and name that differ, sorted. */
      plugin: string[];
      hosts: PluginItemChanges<PluginHostContent>;
      secrets: PluginItemChanges<PluginSecretContent>;
      tools: PluginItemChanges<PluginToolContent>;
      localTools: PluginItemChanges<PluginLocalToolContent>;
      files: PluginFileChanges;
      /**
       * The top-level manifest fields that differ, sorted, such as
       * `description` or `ui`, so a change the sections above don't list
       * is still shown.
       */
      manifest: string[];
    };

/**
 * Compares the content kept in a plugin's trust record with its current
 * content.
 *
 * @param trusted - the record's content, as the store gave it back
 * @param current - the content built from the plugin folder now
 *
 * @example
 * const changes = pluginTrustChanges(record.content, content);
 * if (changes.readable) show(changes.tools.added);
 */
export function pluginTrustChanges(
  trusted: unknown,
  current: PluginTrustContent,
): PluginTrustChanges {
  if (!isPluginTrustContent(trusted)) return { readable: false };
  return {
    readable: true,
    plugin: changedFields(trusted.plugin, current.plugin),
    hosts: itemChanges(trusted.hosts, current.hosts, hostKey),
    secrets: itemChanges(trusted.secrets, current.secrets, partKey),
    tools: itemChanges(trusted.tools, current.tools, partKey),
    localTools: itemChanges(trusted.localTools, current.localTools, (tool) => tool.id),
    files: fileChanges(trusted.files, current.files),
    manifest: changedFields(trusted.manifest, current.manifest),
  };
}

function itemChanges<Item extends object>(
  trusted: readonly Item[],
  current: readonly Item[],
  key: (item: Item) => string,
): PluginItemChanges<Item> {
  const before = new Map(trusted.map((item) => [key(item), item]));
  const after = new Map(current.map((item) => [key(item), item]));
  const changes: PluginItemChanges<Item> = {
    added: current.filter((item) => !before.has(key(item))),
    changed: [],
    removed: trusted.filter((item) => !after.has(key(item))),
  };
  for (const item of current) {
    const old = before.get(key(item));
    const fields = old === undefined ? [] : changedFields(old, item);
    if (old !== undefined && fields.length > 0) {
      changes.changed.push({ before: old, after: item, fields });
    }
  }
  return changes;
}

function fileChanges(
  trusted: readonly PluginFileHash[],
  current: readonly PluginFileHash[],
): PluginFileChanges {
  const before = new Map(trusted.map((file) => [file.path, file.sha256]));
  const after = new Map(current.map((file) => [file.path, file.sha256]));
  const paths = (files: readonly PluginFileHash[], keep: (file: PluginFileHash) => boolean) =>
    files.filter(keep).map((file) => file.path);
  return {
    added: paths(current, (file) => !before.has(file.path)),
    changed: paths(
      current,
      (file) => before.has(file.path) && before.get(file.path) !== file.sha256,
    ),
    removed: paths(trusted, (file) => !after.has(file.path)),
  };
}

/** The top-level fields whose values differ, or that only one side has. */
function changedFields(before: object, after: object): string[] {
  const old = new Map<string, unknown>(Object.entries(before));
  const now = new Map<string, unknown>(Object.entries(after));
  const fields = new Set([...old.keys(), ...now.keys()]);
  return [...fields].filter((field) => !deepEqual(old.get(field), now.get(field))).sort();
}

/**
 * Whether a record's content has the shape of plugin content, as far as
 * the comparison reads it: every section there, every item an object with
 * the keys it is matched by. A record a person edited by hand may hold
 * anything.
 */
function isPluginTrustContent(value: unknown): value is PluginTrustContent {
  if (!isRecord(value) || !isRecord(value["plugin"]) || !isRecord(value["manifest"])) return false;
  return (
    everyItemHas(value["hosts"], ["part"]) &&
    everyItemHas(value["secrets"], ["part", "name"]) &&
    everyItemHas(value["tools"], ["part", "name"]) &&
    everyItemHas(value["localTools"], ["id"]) &&
    everyItemHas(value["files"], ["path", "sha256"])
  );
}

function everyItemHas(list: unknown, keys: readonly string[]): boolean {
  return (
    Array.isArray(list) &&
    list.every((item) => isRecord(item) && keys.every((key) => typeof item[key] === "string"))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
