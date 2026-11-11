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

/** The catalog, the `overrides:` and `patchedDependencies:` lines, the settings that rewrite the tree, and the lines this can't read. */
export interface WorkspaceVersions {
  readonly catalog: readonly CatalogEntry[];
  /** `selector: version` lines under `overrides:`; `name` is the selector. */
  readonly overrides: readonly CatalogEntry[];
  /** `name@version: file` lines under `patchedDependencies:`; `name` is `name@version`, `version` the patch file. */
  readonly patches: readonly CatalogEntry[];
  readonly treeRewrites: readonly { readonly setting: string; readonly line: number }[];
  readonly unreadableLines: readonly number[];
}

/**
 * Top-level settings that swap one package for another or change what a
 * package contains. Each would bypass the catalog and `dependencies.json`.
 * `catalogs:` (named catalogs) is here too: we keep one version line.
 * `overrides:` is read line by line and allowed only for the selectors in
 * `overrides-allowed.json`, and `patchedDependencies:` only for the patches
 * in `patches-allowed.json`; the other settings are always refused.
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
    overrides: CatalogEntry[];
    patches: CatalogEntry[];
    treeRewrites: { setting: string; line: number }[];
    unreadableLines: number[];
  } = { catalog: [], overrides: [], patches: [], treeRewrites: [], unreadableLines: [] };
  let block: Block = "other";
  yaml.split("\n").forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      return;
    }
    if (/^\S/.test(line)) {
      block = readSettingLine(line, lineNumber, versions);
    } else if (block !== "other") {
      const entry = readCatalogEntry(line, lineNumber);
      if (entry === undefined) {
        versions.unreadableLines.push(lineNumber);
      } else {
        versions[block].push(entry);
      }
    }
  });
  return versions;
}

/** The top-level block a line belongs to. */
type Block = "catalog" | "overrides" | "patches" | "other";

/** The top-level settings whose lines are read one by one, and the block each opens. */
const listBlocks: Readonly<Record<string, Block>> = {
  catalog: "catalog",
  overrides: "overrides",
  patchedDependencies: "patches",
};

/** Reads a top-level line; returns the block it opens. */
function readSettingLine(
  line: string,
  lineNumber: number,
  versions: {
    treeRewrites: { setting: string; line: number }[];
    unreadableLines: number[];
  },
): Block {
  const setting = /^["']?([\w-]+)["']?:(?:\s|$)/.exec(line)?.[1];
  if (setting === undefined) {
    versions.unreadableLines.push(lineNumber);
    return "other";
  }
  const block = Object.hasOwn(listBlocks, setting) ? listBlocks[setting] : undefined;
  // A list block holds its entries on the lines below; a value on the same
  // line (such as `overrides: {}`) would hide entries from this reader.
  if (block !== undefined && !new RegExp(`^${setting}:\\s*(?:#.*)?$`).test(line)) {
    versions.unreadableLines.push(lineNumber);
  }
  if (block === undefined && treeRewriteSettings.includes(setting)) {
    versions.treeRewrites.push({ setting, line: lineNumber });
  }
  return block ?? "other";
}

function readCatalogEntry(line: string, lineNumber: number): CatalogEntry | undefined {
  const entry = /^ {2}(["']?)([^\s"':]+)\1:\s+(["']?)([^\s"'#]+)\3\s*(?:#.*)?$/.exec(line);
  if (entry?.[2] === undefined || entry[4] === undefined) {
    return undefined;
  }
  return { name: entry[2], version: entry[4], line: lineNumber };
}
