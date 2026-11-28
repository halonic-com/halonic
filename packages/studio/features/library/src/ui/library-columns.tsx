import type { LibraryItemKind } from "@halonicjs/app";
import { EmptyState, PlaceIcon, usePresentation } from "@halonicjs/studio-kit";
import { listColumnClass } from "@halonicjs/studio-kit/list-column";
import type { ReactNode } from "react";
import { tabLabel, tabSentence } from "../library-words.ts";

/**
 * The list column beside the content pane: the kit's one list-column size (`kit.list-column`),
 * scrolling on its own so the pane stays put (`library.list-column`).
 */
export const libraryListColumnClass = `${listColumnClass} flex shrink-0 flex-col overflow-y-auto border-e border-border`;

/** The content pane: the rest of the width. */
export const contentPaneClass = "flex min-w-0 flex-1 items-center justify-center";

/** The props of {@link LibraryColumns}. */
export interface LibraryColumnsProps {
  /** The kind the list column shows, which the content pane names. */
  readonly kind: LibraryItemKind;
  /** The list column: the Library page. */
  readonly children: ReactNode;
}

/**
 * The desktop Library in the new design (`library.list-column`): the list column with the kinds'
 * chips and the items, and beside it the content pane, which names the selected kind and says
 * what it holds. A row opens its item in the tab, as today; the shell's own list column (rail flow
 * 35, HAL-20676) will keep the list beside the item. A phone shows the list alone.
 */
export function LibraryColumns({ kind, children }: LibraryColumnsProps) {
  if (usePresentation() !== "desktop") return children;
  return (
    <div className="flex h-full min-h-0 w-full">
      <div className={libraryListColumnClass} data-pane="list">
        {children}
      </div>
      <section className={contentPaneClass} data-pane="content" aria-label={tabLabel(kind)}>
        <EmptyState
          align="center"
          headingLevel={2}
          icon={<PlaceIcon name="library" />}
          title={tabLabel(kind)}
          description={tabSentence(kind)}
        />
      </section>
    </div>
  );
}
