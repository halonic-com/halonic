import type { TreeNode } from "./tree-model.ts";

/** One shown row, with what an ARIA tree needs to describe it. */
export interface TreeRow {
  readonly node: TreeNode;
  /** 0 for a top row. */
  readonly depth: number;
  /** The folder this row is in, or `undefined` for a top row. */
  readonly parent: string | undefined;
  /** Position among its siblings, from 1. */
  readonly position: number;
  /** How many siblings it has, itself included. */
  readonly siblings: number;
}

/**
 * The rows the tree shows, top to bottom: folders count only when opened.
 *
 * @param roots - the top rows from `buildTree`
 * @param expanded - the paths of the opened folders
 */
export function visibleRows(roots: readonly TreeNode[], expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (nodes: readonly TreeNode[], depth: number, parent: string | undefined): void => {
    for (const [index, node] of nodes.entries()) {
      rows.push({ node, depth, parent, position: index + 1, siblings: nodes.length });
      if (node.kind === "folder" && expanded.has(node.path))
        walk(node.children, depth + 1, node.path);
    }
  };
  walk(roots, 0, undefined);
  return rows;
}

/**
 * The folders to open so a file shows (requirement `files.tree.reveal-active-file`).
 *
 * @param path - the file's path, such as `hubs/p/agents/a.agent.yaml`
 * @returns `hubs`, `hubs/p` and `hubs/p/agents` for that path
 */
export function foldersAbove(path: string): string[] {
  const segments = path.split("/").filter((segment) => segment !== "");
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
}

/**
 * The opened folders after the tree reveals a file: the ones that were open, plus those above it.
 *
 * @param expanded - the opened folders now
 * @param path - the file to show
 */
export function revealFile(expanded: ReadonlySet<string>, path: string): ReadonlySet<string> {
  return new Set([...expanded, ...foldersAbove(path)]);
}

/**
 * The row to show for a path the tree may not have (requirement `files.tree.reveal-request`): the
 * path's own row, else its deepest folder in the tree. The tree lists only folders that hold
 * files, so an empty or missing folder falls back to the one above it.
 *
 * @param roots - the top rows from `buildTree`
 * @param path - a path from the workspace folder, such as `hubs/reports/docs`
 * @returns the row, or `undefined` when not even the path's top folder is in the tree
 */
export function deepestRow(roots: readonly TreeNode[], path: string): TreeNode | undefined {
  let found: TreeNode | undefined;
  let level: readonly TreeNode[] = roots;
  for (const name of path.split("/").filter((segment) => segment !== "")) {
    const node = level.find((candidate) => candidate.name === name);
    if (node === undefined) break;
    found = node;
    if (node.kind === "file") break;
    level = node.children;
  }
  return found;
}

/**
 * The opened folders after the tree reveals a row another feature asked for: the ones that were
 * open, those above it and, for a folder, the folder itself, so its files show.
 *
 * @param expanded - the opened folders now
 * @param row - the row from `deepestRow`
 */
export function revealRow(expanded: ReadonlySet<string>, row: TreeNode): ReadonlySet<string> {
  const opened = revealFile(expanded, row.path);
  return row.kind === "folder" ? new Set([...opened, row.path]) : opened;
}
