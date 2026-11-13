import type {
  PluginHostContent,
  PluginItemChanges,
  PluginLocalToolContent,
  PluginSecretContent,
  PluginToolContent,
  PluginTrustChanges,
} from "@halonicjs/app";
import { pluginTrustContent } from "@halonicjs/app";
import type { Plugin } from "@halonicjs/format";
import { RISK_WORDS } from "../page/page-text.ts";
import type { PluginToolRisk } from "../page/plugin-pages.ts";

/** The tag on a change row: what happened to the thing since the person trusted the plugin. */
export type ChangeTag = "New" | "Changed" | "Removed";

/** One row of What changed: a thing, its tag and, for a change, the old value and the new one. */
export interface ChangeRow {
  readonly tag: ChangeTag;
  /** What it is, as the person reads it: "Tool forecast", "Address api.example.com". */
  readonly what: string;
  /** Before and after of a changed value, in words; both are plain text. */
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

/** What the changed trust check shows: the rows, and what stayed as it was. */
export interface PluginChangeSummary {
  /** `false` when the record can't be compared: the dialog can only say that something changed. */
  readonly readable: boolean;
  readonly rows: readonly ChangeRow[];
  /** What the plugin has now that no row mentions, one line each, for "Unchanged (n)". */
  readonly unchanged: readonly string[];
}

const partWords = (part: string): string =>
  part === "backend" ? "" : ` (program ${part.replace(/^local:/, "")})`;

const hostWords = (host: unknown): string =>
  typeof host === "string" ? host : JSON.stringify(host);

const riskWords = (risk: string): string => RISK_WORDS[risk as PluginToolRisk] ?? risk;

const FIELD_NOUNS: Readonly<Record<string, string>> = {
  purpose: "what it is for",
  optional: "whether it is optional",
  placement: "how it is sent",
  description: "its description",
  risk: "what it may do",
  untrusted: "whether it reads outside text",
  start: "how it starts",
  args: "its arguments",
  env: "its settings",
  network: "where it may reach",
  callTimeoutMs: "its time limit",
  hosts: "where it may reach",
};

/**
 * The row for a changed item. The state in words is shown as old → new; when both read the same,
 * the change is in a field the words leave out, so the row names the fields core found instead.
 */
function changedRow<Item>(
  what: string,
  { before, after, fields }: { before: Item; after: Item; fields: readonly string[] },
  words: (item: Item) => string,
): ChangeRow {
  const from = words(before);
  const to = words(after);
  if (from !== to) return { tag: "Changed", what, from, to };
  const named = fields.map((field) => FIELD_NOUNS[field] ?? field).join(", ");
  return { tag: "Changed", what, to: `${named} changed` };
}

/** A tool's one-line state: "Reads", "Changes things, outside text". */
function toolState(tool: PluginToolContent): string {
  return [riskWords(tool.risk), tool.untrusted ? "outside text" : undefined]
    .filter((part) => part !== undefined)
    .join(", ");
}

function toolRows(changes: PluginItemChanges<PluginToolContent>): ChangeRow[] {
  const name = (tool: PluginToolContent) => `Tool ${tool.name}${partWords(tool.part)}`;
  return [
    ...changes.added.map((tool) => ({
      tag: "New" as const,
      what: name(tool),
      to: toolState(tool),
    })),
    ...changes.changed.map((change) => changedRow(name(change.after), change, toolState)),
    ...changes.removed.map((tool) => ({
      tag: "Removed" as const,
      what: name(tool),
      from: toolState(tool),
    })),
  ];
}

function secretRows(changes: PluginItemChanges<PluginSecretContent>): ChangeRow[] {
  const goes = (secret: PluginSecretContent) =>
    `goes only to ${secret.hosts.map(hostWords).join(", ")}`;
  const name = (secret: PluginSecretContent) => `Secret ${secret.name}${partWords(secret.part)}`;
  return [
    ...changes.added.map((secret) => ({
      tag: "New" as const,
      what: name(secret),
      to: goes(secret),
    })),
    ...changes.changed.map((change) => changedRow(name(change.after), change, goes)),
    ...changes.removed.map((secret) => ({
      tag: "Removed" as const,
      what: name(secret),
      from: goes(secret),
    })),
  ];
}

function hostRows(changes: PluginItemChanges<PluginHostContent>): ChangeRow[] {
  const name = (host: PluginHostContent) =>
    `Address ${hostWords(host.host)}${partWords(host.part)}`;
  return [
    ...changes.added.map((host) => ({ tag: "New" as const, what: name(host) })),
    ...changes.removed.map((host) => ({ tag: "Removed" as const, what: name(host) })),
  ];
}

/**
 * A program's start and arguments as one line: "npx weather-mcp@1.2.3 --units metric" for a package,
 * "node ./server.js" for a script.
 */
function programLine(program: PluginLocalToolContent): string {
  const { runner, name, version, program: script, path } = program.start;
  const head =
    typeof name === "string"
      ? [runner, version === undefined ? name : `${name}@${version}`]
      : [script, path];
  return [...head, ...program.args].filter((part) => typeof part === "string").join(" ");
}

function programRows(changes: PluginItemChanges<PluginLocalToolContent>): ChangeRow[] {
  const name = (program: PluginLocalToolContent) => `Program ${program.id}`;
  return [
    ...changes.added.map((program) => ({
      tag: "New" as const,
      what: name(program),
      to: programLine(program),
    })),
    ...changes.changed.map((change) => changedRow(name(change.after), change, programLine)),
    ...changes.removed.map((program) => ({
      tag: "Removed" as const,
      what: name(program),
      from: programLine(program),
    })),
  ];
}

/** What stayed the same: the plugin's tools, programs, secrets and addresses no row mentions. */
function unchangedOf(manifest: Plugin, changes: Extract<PluginTrustChanges, { readable: true }>) {
  const content = pluginTrustContent({ plugin: manifest, files: [] });
  const touched = (list: PluginItemChanges<object>, key: (item: never) => string) =>
    new Set(
      [...list.added, ...list.changed.map(({ after }) => after)].map((item) => key(item as never)),
    );
  const tools = touched(changes.tools, (tool: PluginToolContent) => `${tool.part}\n${tool.name}`);
  const secrets = touched(
    changes.secrets,
    (secret: PluginSecretContent) => `${secret.part}\n${secret.name}`,
  );
  const programs = touched(changes.localTools, (program: PluginLocalToolContent) => program.id);
  const hosts = touched(
    changes.hosts,
    (host: PluginHostContent) => `${host.part}\n${hostWords(host.host)}`,
  );
  return [
    ...content.tools
      .filter((tool) => !tools.has(`${tool.part}\n${tool.name}`))
      .map((tool) => `Tool ${tool.name}${partWords(tool.part)}`),
    ...content.localTools
      .filter((program) => !programs.has(program.id))
      .map((program) => `Program ${program.id}`),
    ...content.secrets
      .filter((secret) => !secrets.has(`${secret.part}\n${secret.name}`))
      .map((secret) => `Secret ${secret.name}${partWords(secret.part)}`),
    ...content.hosts
      .filter((host) => !hosts.has(`${host.part}\n${hostWords(host.host)}`))
      .map((host) => `Address ${hostWords(host.host)}${partWords(host.part)}`),
  ];
}

/** Whether a section row already says the change in a manifest's `backend` or `localTools` part. */
function partHasRow(field: string, changes: Extract<PluginTrustChanges, { readable: true }>) {
  if (field !== "backend" && field !== "localTools") return false;
  const lists = [changes.tools, changes.secrets, changes.hosts, changes.localTools];
  return lists.some((list) =>
    [...list.added, ...list.removed, ...list.changed.map(({ after }) => after)].some((item) => {
      const part = "part" in item ? item.part : "local:";
      return (field === "backend") === (part === "backend");
    }),
  );
}

/** The manifest fields the rows above already say, in their own words. */
const COVERED_FIELDS = new Set(["id", "version", "sdk", "name"]);

const FIELD_WORDS: Readonly<Record<string, string>> = {
  id: "Plugin id",
  version: "Version",
  sdk: "Plugin format",
  name: "Name",
};

/**
 * What changed in a plugin since the person trusted it, as the trust check lists it (design
 * section 6): the changes core found, in the order the trust check shows its sections (tools,
 * programs, secrets, addresses), then the plugin's own fields, its files and any other part of the
 * manifest, and what stayed as it was. Core keeps no old value for a field or a file, so those
 * rows only say that it changed.
 *
 * @example
 * const summary = changeSummary(manifest, plugin.changes);
 * summary.rows[0]; // { tag: "New", what: "Tool set_alert", to: "Changes things" }
 */
export function changeSummary(manifest: Plugin, changes: PluginTrustChanges): PluginChangeSummary {
  if (!changes.readable) return { readable: false, rows: [], unchanged: [] };
  const rows: ChangeRow[] = [
    ...toolRows(changes.tools),
    ...programRows(changes.localTools),
    ...secretRows(changes.secrets),
    ...hostRows(changes.hosts),
    ...changes.plugin.map((field) => ({
      tag: "Changed" as const,
      what: FIELD_WORDS[field] ?? field,
    })),
    ...changes.files.added.map((path) => ({ tag: "New" as const, what: `File ${path}` })),
    ...changes.files.changed.map((path) => ({ tag: "Changed" as const, what: `File ${path}` })),
    ...changes.files.removed.map((path) => ({ tag: "Removed" as const, what: `File ${path}` })),
    ...changes.manifest
      .filter((field) => !COVERED_FIELDS.has(field) && !partHasRow(field, changes))
      .map((field) => ({ tag: "Changed" as const, what: `Manifest ${field}` })),
  ];
  return { readable: true, rows, unchanged: unchangedOf(manifest, changes) };
}
