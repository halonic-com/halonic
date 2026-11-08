/**
 * Reads the parts of `pnpm-workspace.yaml` that decide which versions get
 * installed: the `catalog:` and the settings that rewrite the dependency
 * tree. A line reader keeps the check free of a YAML library; a line it
 * can't read is reported, so the check fails closed.
 */

/** One `name: version` line of the catalog. */
export interface CatalogEntry {
  readonly name: string;
  readonly version: string;
  readonly line: number;
}

/** The catalog, the settings that rewrite the tree, and the lines this can't read. */
export interface WorkspaceVersions {
  readonly catalog: readonly CatalogEntry[];
  readonly treeRewrites: readonly { readonly setting: string; readonly line: number }[];
  readonly unreadableLines: readonly number[];
}

/**
 * Top-level settings that swap one package for another or change what a
 * package contains. Each would bypass the catalog and `dependencies.json`.
 * `catalogs:` (named catalogs) is here too: we keep one version line.
 */
export const treeRewriteSettings = [
  "overrides",
  "packageExtensions",
  "patchedDependencies",
  "catalogs",
];

/** A plain semver version or range: `1.2.3`, `^1.2.3` or `~1.2.3`, optionally with a pre-release. */
export const plainVersion = /^[\^~]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function readWorkspaceVersions(yaml: string): WorkspaceVersions {
  const catalog: CatalogEntry[] = [];
  const treeRewrites: { setting: string; line: number }[] = [];
  const unreadableLines: number[] = [];
  let inCatalog = false;
  yaml.split("\n").forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      return;
    }
    if (/^\S/.test(line)) {
      const setting = /^["']?([\w-]+)["']?:(?:\s|$)/.exec(line)?.[1];
      if (setting === undefined) {
        inCatalog = false;
        unreadableLines.push(lineNumber);
        return;
      }
      inCatalog = setting === "catalog";
      if (treeRewriteSettings.includes(setting)) {
        treeRewrites.push({ setting, line: lineNumber });
      }
      if (inCatalog && !/^catalog:\s*(?:#.*)?$/.test(line)) {
        unreadableLines.push(lineNumber);
      }
      return;
    }
    if (!inCatalog) {
      return;
    }
    const entry = /^ {2}(["']?)([^\s"':]+)\1:\s+(["']?)([^\s"'#]+)\3\s*(?:#.*)?$/.exec(line);
    if (entry?.[2] === undefined || entry[4] === undefined) {
      unreadableLines.push(lineNumber);
      return;
    }
    catalog.push({ name: entry[2], version: entry[4], line: lineNumber });
  });
  return { catalog, treeRewrites, unreadableLines };
}
