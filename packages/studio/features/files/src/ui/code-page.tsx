import { EmptyState, FileIcon, usePresentation } from "@halonicjs/studio-kit";
import { listColumnClass } from "@halonicjs/studio-kit/list-column";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { paneFile, treeContext } from "../code-page.ts";
import { fileItem } from "../file-item.ts";
import { filesWords } from "../files-words.ts";
import { renameAsks } from "../rename-request.ts";
import { CodeListColumn } from "./code-list-column.tsx";
import { type BesideList, FileView } from "./file-view.tsx";
import { FilesSidebarView } from "./files-sidebar-view.tsx";

/** The list column: the kit's one list-column size, scrolling on its own so the pane stays put. */
export const codeListColumnClass = `${listColumnClass} flex shrink-0 flex-col overflow-y-auto border-e border-border`;

/** The content pane: the rest of the width, on the pane's surface. */
export const codePaneClass = "flex min-w-0 flex-1 flex-col bg-surface";

/** The pane's file has no sections of other features: those belong to an item's page. */
function NoSections() {
  return null;
}

/** The pane while no file is open: a region named by its heading. */
function NoFilePane() {
  return (
    <section
      className={`${codePaneClass} items-center justify-center`}
      data-pane="content"
      aria-label={filesWords.noFileTitle}
    >
      <EmptyState
        align="center"
        headingLevel={2}
        icon={<FileIcon />}
        title={filesWords.noFileTitle}
        description={filesWords.noFileDescription}
      />
    </section>
  );
}

/**
 * Code's page (`files.code-page`), like a chat: the file tree under the "Code" title in the list
 * column, and the file picked there in the content pane, which a click on another file replaces.
 * There are no file tabs; a Ctrl-click opens a file in a new window tab. The list column keeps its
 * own rename asks and takes none of the window's, which belong to the sidebar's tree, so a Code
 * page in a tab behind takes nothing meant for the tree in view. A phone shows the tree alone,
 * and a file opens as its own page there.
 */
export function CodePage({ context }: ItemViewProps) {
  const desktop = usePresentation() === "desktop";
  const [pane] = useState(paneFile);
  const [asks] = useState(renameAsks);
  const listColumn = useRef<HTMLDivElement>(null);
  const paneContext = useMemo(() => treeContext(context, pane), [context, pane]);
  const list: BesideList = useMemo(
    () => ({
      rename: (path) => asks.ask(path),
      focusTree: () =>
        listColumn.current?.querySelector<HTMLElement>('[data-path][tabindex="0"]')?.focus(),
    }),
    [asks],
  );
  const path = useSyncExternalStore(pane.subscribe, pane.get);
  if (!desktop) return <FilesSidebarView context={context} title={filesWords.codeTitle} />;
  return (
    <div className="flex h-full min-h-0 w-full">
      <div ref={listColumn} className={codeListColumnClass} data-pane="list">
        <CodeListColumn context={context} open={path} setOpen={pane.show} renames={asks} />
      </div>
      {path === undefined ? (
        <NoFilePane />
      ) : (
        // The file's own section names the pane. A new file is a new editor: nothing of the last
        // file's text or strips carries over.
        <div className={codePaneClass} data-pane="content">
          <FileView
            key={path}
            item={fileItem(path)}
            context={paneContext}
            Sections={NoSections}
            list={list}
          />
        </div>
      )}
    </div>
  );
}
