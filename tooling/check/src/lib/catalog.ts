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
  const versions: WorkspaceVersions & {
    catalog: CatalogEntry[];
    treeRewrites: { setting: string; line: number }[];
    unreadableLines: number[];
  } = { catalog: [], treeRewrites: [], unreadableLines: [] };
  let inCatalog = false;
  yaml.split("\n").forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      return;
    }
    if (/^\S/.test(line)) {
      inCatalog = readSettingLine(line, lineNumber, versions);
    } else if (inCatalog) {
      const entry = readCatalogEntry(line, lineNumber);
      if (entry === undefined) {
        versions.unreadableLines.push(lineNumber);
      } else {
        versions.catalog.push(entry);
      }
    }
  });
  return versions;
}

/** Reads a top-level line; true when it opens the `catalog:` block. */
function readSettingLine(
  line: string,
  lineNumber: number,
  versions: {
    treeRewrites: { setting: string; line: number }[];
    unreadableLines: number[];
  },
): boolean {
  const setting = /^["']?([\w-]+)["']?:(?:\s|$)/.exec(line)?.[1];
  const opensCatalog = setting === "catalog";
  if (setting === undefined || (opensCatalog && !/^catalog:\s*(?:#.*)?$/.test(line))) {
    versions.unreadableLines.push(lineNumber);
  }
  if (setting !== undefined && treeRewriteSettings.includes(setting)) {
    versions.treeRewrites.push({ setting, line: lineNumber });
  }
  return opensCatalog;
}

function readCatalogEntry(line: string, lineNumber: number): CatalogEntry | undefined {
  const entry = /^ {2}(["']?)([^\s"':]+)\1:\s+(["']?)([^\s"'#]+)\3\s*(?:#.*)?$/.exec(line);
  if (entry?.[2] === undefined || entry[4] === undefined) {
    return undefined;
  }
  return { name: entry[2], version: entry[4], line: lineNumber };
}
