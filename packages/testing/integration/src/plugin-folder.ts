// Reads a plugin folder the way Halonic does (ADR 2026-11-09-plugins,
// sections 1 and 1.5): one `plugin.yaml`, or an `integration.yaml` read as a
// plugin with only a backend, never both. The suite runs in Node, so it reads
// the folder itself; the plugin's own code never gets a file system.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import {
  type FileProblem,
  type Plugin,
  parseFile,
  pluginFromIntegrationSheet,
} from "@halonicjs/format";
import { fail } from "./failure.ts";

/** The manifest files a plugin folder may have, at most one of them. */
export type ManifestFile = "plugin.yaml" | "integration.yaml";

/** A plugin folder whose manifest passed its schema and its own checks. */
export interface PluginFolder {
  readonly plugin: Plugin;
  readonly manifest: ManifestFile;
}

const manifestFiles: readonly ManifestFile[] = ["plugin.yaml", "integration.yaml"];

/** The file endings of code the source scan reads. */
const codeFile = /\.(?:[cm]?js|[cm]?ts)$/;

/**
 * The folder's manifest, parsed and checked as `halonic validate` does.
 * Fails the check when the folder has no manifest, has both, or its
 * manifest has a problem, naming each with its line.
 *
 * @example
 * readPluginFolder("plugins/weather").plugin.ui?.commands?.[0]?.tool; // "forecast"
 */
export function readPluginFolder(folder: string): PluginFolder {
  const found = manifestFiles.filter((name) => existsSync(join(folder, name)));
  const [manifest] = found;
  if (manifest === undefined) fail(`${folder} has no plugin.yaml`);
  if (found.length > 1)
    fail("the folder has both plugin.yaml and integration.yaml; keep only plugin.yaml");
  const text = readFileSync(join(folder, manifest), "utf8");
  if (manifest === "plugin.yaml") {
    const parsed = parseFile("plugin", text);
    if (!parsed.ok) fail(problemsText(manifest, parsed.error));
    return { plugin: parsed.value.value, manifest };
  }
  const parsed = parseFile("integration", text);
  if (!parsed.ok) fail(problemsText(manifest, parsed.error));
  return { plugin: pluginFromIntegrationSheet(parsed.value.value), manifest };
}

/**
 * The code files in the folder of the backend's `entry` and below it, by
 * their path in the plugin folder, for the source scan. Skips
 * `node_modules`, which the built entry doesn't load from.
 */
export function backendSources(folder: string, entry: string): Record<string, string> {
  const sources: Record<string, string> = {};
  const root = join(folder, dirname(entry));
  const files = existsSync(root) ? readdirSync(root, { recursive: true, encoding: "utf8" }) : [];
  for (const file of files) {
    if (!codeFile.test(file) || file.split(sep).includes("node_modules")) continue;
    const path = join(root, file);
    sources[relative(folder, path).split(sep).join("/")] = readFileSync(path, "utf8");
  }
  return sources;
}

function problemsText(manifest: ManifestFile, problems: readonly FileProblem[]): string {
  const lines = problems.map(
    ({ line, col, message, path }) =>
      `${manifest}:${line}:${col}: ${message}${path.length > 0 ? ` (at ${path.join(".")})` : ""}`,
  );
  return `${manifest} is invalid:\n${lines.join("\n")}`;
}
