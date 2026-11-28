import type { TreeNode } from "./tree-model.ts";

/**
 * The text a search looks for (requirement `files.ui.tree-search`): what was typed, without the
 * spaces round it and in lower case. Empty while nothing is searched.
 *
 * @param typed - the search field's text
 */
export function searchTextOf(typed: string): string {
  return typed.trim().toLowerCase();
}

/**
 * The files a search shows: those whose path holds the text, whatever the case, in the listing's
 * order. A folder's name counts, so `checkout/` finds every file in that folder.
 *
 * @param paths - every file in the workspace
 * @param text - the text from `searchTextOf`; empty keeps every file
 */
export function matchingFiles(paths: readonly string[], text: string): readonly string[] {
  if (text === "") return paths;
  return paths.filter((path) => path.toLowerCase().includes(text));
}

/** What a search needs to know about the tree it shows. */
export interface SearchedTree {
  /** Every folder in the tree, so a search shows them all open. */
  readonly folders: ReadonlySet<string>;
  /** How many files the tree holds, for the "3 files" line. */
  readonly files: number;
}

/**
 * The folders and the number of files in a tree, counted from the rows the tree draws, so a file in
 * a folder the tree never shows, such as `node_modules`, isn't counted.
 *
 * @param roots - the top rows from `buildTree`
 */
export function searchedTree(roots: readonly TreeNode[]): SearchedTree {
  const folders = new Set<string>();
  let files = 0;
  const walk = (nodes: readonly TreeNode[]): void => {
    for (const node of nodes) {
      if (node.kind === "file") {
        files += 1;
        continue;
      }
      folders.add(node.path);
      walk(node.children);
    }
  };
  walk(roots);
  return { folders, files };
}

/**
 * The folders left after taking some away: the open ones while a search shows (all, less the
 * closed ones), and the closed ones after a row was opened or closed (all, less the open ones).
 *
 * @param folders - every folder of the searched tree
 * @param without - the folders to leave out
 */
export function foldersWithout(
  folders: ReadonlySet<string>,
  without: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set([...folders].filter((folder) => !without.has(folder)));
}
