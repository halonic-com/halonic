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
