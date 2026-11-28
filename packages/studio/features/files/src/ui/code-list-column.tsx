import { FilterChips } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { useCallback, useMemo, useState } from "react";
import { type PaneFile, treeContext } from "../code-page.ts";
import { filesWords } from "../files-words.ts";
import type { RenameAsks } from "../rename-request.ts";
import type { TreeFilter } from "../tree/tree-filter.ts";
import { FilesSidebarView } from "./files-sidebar-view.tsx";

/**
 * What Code's list column gets, in the shape of a place's list column (`open`, `setOpen`), so the
 * window can draw it in its own list column later without a change here.
 */
export interface CodeListColumnProps {
  /** The context of the feature that added Code's page. */
  readonly context: WorkspaceContext;
  /** The path of the file open in Code's content pane, or `undefined` for none. */
  readonly open: string | undefined;
  /** Opens a file in Code's content pane. */
  readonly setOpen: (path: string) => void;
  /**
   * Code's own rename asks, from its content pane's Rename and F2. The column takes these in place
   * of the window's, which belong to the sidebar's tree (`files.code-page`).
   */
  readonly renames: RenameAsks;
}

/** The pane as the tree reads it: a new one for each open file, so the tree reads it again. */
function paneOf(open: string | undefined, setOpen: (path: string) => void): PaneFile {
  return { get: () => open, show: setOpen, subscribe: () => () => {} };
}

/**
 * Code's list column (`files.code-page`, `files.code-list-chips`): the "Code" title with **New
 * file**, the search field, the All and Problems chips, and the file tree. A file the tree opens
 * shows in the content pane through `setOpen`; the open file's row is marked.
 */
export function CodeListColumn({ context, open, setOpen, renames }: CodeListColumnProps) {
  const [filter, setFilter] = useState<TreeFilter>("all");
  const showAll = useCallback(() => setFilter("all"), []);
  const listContext = useMemo(
    () => treeContext(context, paneOf(open, setOpen)),
    [context, open, setOpen],
  );
  const chips = (
    <FilterChips<TreeFilter>
      label={filesWords.chipsLabel}
      options={[
        { value: "all", label: filesWords.allChip },
        { value: "problems", label: filesWords.problemsChip },
      ]}
      value={filter}
      onChange={setFilter}
    />
  );
  return (
    <FilesSidebarView
      context={listContext}
      title={filesWords.codeTitle}
      chips={chips}
      filter={filter}
      showAll={showAll}
      pageAsks={renames}
    />
  );
}
