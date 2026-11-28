import { EmptyState, FileIcon, usePresentation } from "@halonicjs/studio-kit";
import { listColumnClass } from "@halonicjs/studio-kit/list-column";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { useMemo, useState, useSyncExternalStore } from "react";
import { paneFile, treeContext } from "../code-page.ts";
import { fileItem, fileName } from "../file-item.ts";
import { filesWords } from "../files-words.ts";
import { FileView } from "./file-view.tsx";
import { FilesSidebarView } from "./files-sidebar-view.tsx";

/** The list column: the kit's one list-column size, scrolling on its own so the pane stays put. */
export const codeListColumnClass = `${listColumnClass} flex shrink-0 flex-col overflow-y-auto border-e border-border`;

/** The content pane: the rest of the width, on the pane's surface. */
export const codePaneClass = "flex min-w-0 flex-1 flex-col bg-surface";

/** The pane's file has no sections of other features: those belong to an item's page. */
function NoSections() {
  return null;
}

/**
 * Code's page (`files.code-page`), like a chat: the file tree under the "Code" title in the list
 * column, and the file picked there in the content pane, which a click on another file replaces.
 * There are no file tabs; a Ctrl-click opens a file in a new window tab. A phone shows the tree
 * alone, and a file opens as its own page there.
 */
export function CodePage({ context }: ItemViewProps) {
  const desktop = usePresentation() === "desktop";
  const [pane] = useState(paneFile);
  const paneContext = useMemo(() => treeContext(context, pane), [context, pane]);
  const path = useSyncExternalStore(pane.subscribe, pane.get);
  if (!desktop) return <FilesSidebarView context={context} title={filesWords.codeTitle} />;
  return (
    <div className="flex h-full min-h-0 w-full">
      <div className={codeListColumnClass} data-pane="list">
        <FilesSidebarView context={paneContext} title={filesWords.codeTitle} />
      </div>
      <section
        className={codePaneClass}
        data-pane="content"
        aria-label={path === undefined ? filesWords.noFileTitle : fileName(path)}
      >
        {path === undefined ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              align="center"
              headingLevel={2}
              icon={<FileIcon />}
              title={filesWords.noFileTitle}
              description={filesWords.noFileDescription}
            />
          </div>
        ) : (
          // A new file is a new editor: nothing of the last file's text or strips carries over.
          <FileView key={path} item={fileItem(path)} context={paneContext} Sections={NoSections} />
        )}
      </section>
    </div>
  );
}
