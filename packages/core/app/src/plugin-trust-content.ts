// A plugin's trust content and fingerprint, as `app.plugin-trust-content`
// asks (ADR 2026-11-09-plugins, section 6; P2 plan section 4). The content
// is what the prompt shows, plus the whole manifest and the hash of every
// file, so any change to the plugin changes its fingerprint.

import type { Plugin, PluginLocalTool } from "@halonicjs/format";
import type { Digest } from "@halonicjs/ports";
import { bytesToHex, canonicalJson, encodeUtf8 } from "@halonicjs/std";

/**
 * The prefix of a plugin fingerprint. It differs from a workspace's
 * `hfp1:`, so a plugin fingerprint can never be taken for a workspace one.
 * A change to the content or its encoding gets a new prefix.
 */
export const pluginTrustFingerprintPrefix = "hpf1:";

/** Which part of a plugin something belongs to: its backend, or one local tool as `local:<id>`. */
export type PluginPart = "backend" | `local:${string}`;

/** A host the plugin may reach: a backend host as written, or a local tool's `network` entry. */
export interface PluginHostContent {
  part: PluginPart;
  /** A host name such as `api.example.com`, or a backend's `{ fromSetting, class }`. */
  host: unknown;
}

/** A secret the plugin declares, with where it may go and, for the backend, how it is put in. */
export interface PluginSecretContent {
  part: PluginPart;
  name: string;
  purpose: string;
  hosts: unknown[];
  optional: boolean;
  /** For a backend secret, how the kit puts it in: `bearer`, `header` or `form`, with its field. */
  placement?: Record<string, unknown>;
}

/** A tool the plugin declares, with what it may do. */
export interface PluginToolContent {
  part: PluginPart;
  name: string;
  risk: string;
  untrusted: boolean;
}

/** A local tool's program: how it starts, with what, and where it may reach. */
export interface PluginLocalToolContent {
  id: string;
  /** The package pin (`runner`, `name`, `version`, `registry`) or the script (`program`, `path`). */
  start: Record<string, unknown>;
  args: string[];
  /** Each environment variable by name, and the setting or secret it reads. */
  env: Record<string, unknown>;
  network: string[];
  callTimeoutMs: number;
}

/** One file in the plugin folder and the SHA-256 of its bytes, in lowercase hex. */
export interface PluginFileHash {
  path: string;
  sha256: string;
}

/**
 * The normalised content of a plugin that its trust fingerprint covers.
 * Plain JSON data, so the trust record keeps it and "what changed" can be
 * shown later. Every list is sorted, so the same plugin always gives the
 * same content.
 */
export interface PluginTrustContent {
  plugin: { id: string; version: string; sdk: number; name: string };
  hosts: PluginHostContent[];
  secrets: PluginSecretContent[];
  tools: PluginToolContent[];
  localTools: PluginLocalToolContent[];
  /**
   * The whole parsed manifest, with defaults filled in, so a change the
   * prompt doesn't list (a description, a UI label) still changes the
   * fingerprint.
   */
  manifest: Plugin;
  /** Every file in the plugin folder, `plugin.yaml` included, sorted by path. */
  files: PluginFileHash[];
}

/** What {@link pluginTrustContent} reads. */
export interface PluginTrustInput {
  /** The manifest, as parsed and checked. */
  readonly plugin: Plugin;
  /** The hash of every file in the plugin folder, of the bytes that were read. */
  readonly files: readonly PluginFileHash[];
}

/**
 * Builds a plugin's trust content from its parsed manifest and file hashes.
 *
 * @example
 * const content = pluginTrustContent({ plugin, files: [{ path: "plugin.yaml", sha256: "9f86…" }] });
 */
export function pluginTrustContent(input: PluginTrustInput): PluginTrustContent {
  const { plugin } = input;
  const localTools = plugin.localTools ?? [];
  return {
    plugin: { id: plugin.id, version: plugin.version, sdk: plugin.sdk, name: plugin.name },
    hosts: sortByKey([...backendHosts(plugin), ...localTools.flatMap(localToolHosts)], hostKey),
    secrets: sortByKey(
      [...backendSecrets(plugin), ...localTools.flatMap(localToolSecrets)],
      partKey,
    ),
    tools: sortByKey([...backendTools(plugin), ...localTools.flatMap(localToolTools)], partKey),
    localTools: sortByKey(localTools.map(localToolContent), (tool) => tool.id),
    manifest: plugin,
    files: sortByKey([...input.files], (file) => file.path),
  };
}

/**
 * The trust fingerprint of a plugin: `hpf1:` and the SHA-256, in hex, of
 * its trust content. The encoding is the workspace fingerprint's: the
 * content as canonical JSON, preceded by its length in bytes and a line
 * break.
 *
 * @example
 * await pluginTrustFingerprint(content, digest); // "hpf1:3b1f…"
 */
export async function pluginTrustFingerprint(
  content: PluginTrustContent,
  digest: Digest,
): Promise<string> {
  const json = encodeUtf8(canonicalJson(content));
  const length = encodeUtf8(`${json.length}\n`);
  const encoded = new Uint8Array(length.length + json.length);
  encoded.set(length, 0);
  encoded.set(json, length.length);
  return `${pluginTrustFingerprintPrefix}${bytesToHex(await digest.sha256(encoded))}`;
}

function backendHosts(plugin: Plugin): PluginHostContent[] {
  return (plugin.backend?.hosts ?? []).map((host) => ({ part: "backend", host }));
}

function localToolHosts(tool: PluginLocalTool): PluginHostContent[] {
  return tool.network.map((host) => ({ part: localPart(tool), host }));
}

function backendSecrets(plugin: Plugin): PluginSecretContent[] {
  return Object.entries(plugin.backend?.secrets ?? {}).map(([name, secret]) => {
    const { purpose, hosts, optional, ...placement } = secret;
    return { part: "backend", name, purpose, hosts, optional, placement };
  });
}

function localToolSecrets(tool: PluginLocalTool): PluginSecretContent[] {
  return Object.entries(tool.secrets).map(([name, secret]) => ({
    part: localPart(tool),
    name,
    purpose: secret.purpose,
    hosts: secret.hosts,
    optional: secret.optional,
  }));
}

function backendTools(plugin: Plugin): PluginToolContent[] {
  return (plugin.backend?.tools ?? []).map((tool) => ({
    part: "backend",
    name: tool.name,
    risk: tool.risk,
    untrusted: tool.untrusted,
  }));
}

function localToolTools(tool: PluginLocalTool): PluginToolContent[] {
  return tool.tools.map(({ name, risk, untrusted }) => ({
    part: localPart(tool),
    name,
    risk,
    untrusted,
  }));
}

function localToolContent(tool: PluginLocalTool): PluginLocalToolContent {
  return {
    id: tool.id,
    start: { ...(tool.start.package ?? tool.start.script) },
    args: tool.args,
    env: tool.env,
    network: tool.network,
    callTimeoutMs: tool.callTimeoutMs,
  };
}

/** The part a local tool is, such as `local:files`. */
export function localPart(tool: PluginLocalTool): PluginPart {
  return `local:${tool.id}`;
}

/**
 * The key a host is sorted and matched by: its part, then the host as
 * canonical JSON. A changed host is one removed and one added.
 */
export function hostKey(host: PluginHostContent): string {
  return `${host.part}\n${canonicalJson(host.host)}`;
}

/** The key a secret or tool is sorted and matched by: its part, then its name. */
export function partKey(item: { part: string; name: string }): string {
  return `${item.part}\n${item.name}`;
}

/** Sorted by `key` in plain code-unit order, never the locale's, so the content is the same everywhere. */
function sortByKey<Item>(items: Item[], key: (item: Item) => string): Item[] {
  return items
    .map((item) => ({ item, key: key(item) }))
    .sort((left, right) => compareCodeUnits(left.key, right.key))
    .map(({ item }) => item);
}

function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
