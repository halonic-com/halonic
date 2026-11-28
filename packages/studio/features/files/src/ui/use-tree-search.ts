import { useCallback, useMemo, useState } from "react";
import type { FilesListing } from "../files-host.ts";
import type { TreeState } from "../tree/tree-keyboard.ts";
import { buildTree, type TreeNode } from "../tree/tree-model.ts";
import { foldersWithout, matchingFiles, searchedTree, searchTextOf } from "../tree/tree-search.ts";

const noFolders: ReadonlySet<string> = new Set();
const noRows: readonly TreeNode[] = [];

/** The file tree as its search field leaves it (requirement `files.ui.tree-search`). */
export interface TreeSearch {
  /** The search field's text, as typed. */
  readonly typed: string;
  /** Sets the field's text; the folders closed during the last search open again. */
  readonly type: (typed: string) => void;
  /** Whether the field holds text to search for. */
  readonly searching: boolean;
  /** How many files match; 0 while nothing is searched. */
  readonly matches: number;
  /** Whether the search leaves a file out of the tree; false while nothing is searched. */
  readonly hides: (path: string) => boolean;
  /** The rows to draw: the matching files under their folders, or the whole tree. */
  readonly roots: readonly TreeNode[];
  /** The whole tree, whatever is searched: where a path another feature asks for is looked up. */
  readonly allRoots: readonly TreeNode[];
  /** The tree's state to draw: while searching, every folder is open but the ones closed since. */
  readonly state: TreeState;
  /** Takes the tree's new state; the folders the person had opened before the search are kept. */
  readonly onStateChange: (state: TreeState) => void;
}

/**
 * The search over the file tree. While the field holds text the tree shows only the matching
 * files, with their folders open; the folders the person opened themselves are left alone, so
 * the tree is as it was once the field is empty again.
 *
 * @param listing - the workspace's files, or `undefined` until they are listed
 * @param state - the tree's own state, which the page owns
 * @param setState - sets that state
 */
export function useTreeSearch(
  listing: FilesListing | undefined,
  state: TreeState,
  setState: (state: TreeState) => void,
): TreeSearch {
  const [typed, setTyped] = useState("");
  const [closed, setClosed] = useState(noFolders);
  const text = searchTextOf(typed);
  const allRoots = useMemo(
    () => (listing === undefined ? noRows : buildTree(listing.paths, listing.marks)),
    [listing],
  );
  const found = useMemo(() => {
    if (listing === undefined || text === "") return undefined;
    const roots = buildTree(matchingFiles(listing.paths, text), listing.marks);
    return { roots, ...searchedTree(roots) };
  }, [listing, text]);
  const type = useCallback((next: string) => {
    setTyped(next);
    setClosed(noFolders);
  }, []);

  const hides = useCallback(
    (path: string) => text !== "" && matchingFiles([path], text).length === 0,
    [text],
  );

  // The open folders are kept the same while only the focus moves, so the tree doesn't work out
  // and measure its rows again on every arrow key: see `onStateChange`.
  const searchedExpanded = useMemo(
    () => (found === undefined ? undefined : foldersWithout(found.folders, closed)),
    [found, closed],
  );
  const shownState = useMemo(
    () => (searchedExpanded === undefined ? state : { ...state, expanded: searchedExpanded }),
    [searchedExpanded, state],
  );
  const kept = state.expanded;
  const onStateChange = useCallback(
    (next: TreeState) => {
      if (found === undefined) {
        setState(next);
        return;
      }
      // A move of the focus hands back the set the tree was given: no folder opened or closed.
      if (next.expanded !== searchedExpanded)
        setClosed(foldersWithout(found.folders, next.expanded));
      setState({ ...next, expanded: kept });
    },
    [found, kept, searchedExpanded, setState],
  );

  return {
    typed,
    type,
    searching: found !== undefined,
    matches: found?.files ?? 0,
    hides,
    roots: found?.roots ?? allRoots,
    allRoots,
    state: shownState,
    onStateChange,
  };
}
