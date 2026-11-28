// Code's page (`files.code-page`): the file tree in the list column and the picked file in the
// content pane. The rules for what the tree's gestures do there are kept out of the view, so they
// are tested without drawing the page.

import type { ItemRef, WorkspaceContext } from "@halonicjs/studio-shell";
import { FILE_HUB, FILE_KIND, fileItem } from "./file-item.ts";

/** What the tree reads as the active tab's item. */
type ActiveItemSource = NonNullable<WorkspaceContext["activeItem"]>;

/** The item kind of Code's page. Files have no place, so the page is an item of its own. */
export const CODE_KIND = "code";

/** The one Code page of the workspace, the page the rail's Code entry opens. */
export const codePageItem: ItemRef = { kind: CODE_KIND, hub: FILE_HUB, id: "files" };

/** The key of Code's page, as a tab and the rail's `opens` hold it. */
export const codePageKey = `${codePageItem.kind}/${codePageItem.hub}/${codePageItem.id}`;

/** The file the content pane shows, and a way to hear it change, as the tree reads it. */
export interface PaneFile {
  /** The path of the file in the pane, or `undefined` while none is open. */
  get(): string | undefined;
  /** Shows the file at `path` in the pane. */
  show(path: string): void;
  /** Calls `listener` when the pane's file changes; returns the way to stop. */
  subscribe(listener: () => void): () => void;
}

/** A pane that starts empty: the page keeps one for as long as it shows. */
export function paneFile(): PaneFile {
  let path: string | undefined;
  const listeners = new Set<() => void>();
  return {
    get: () => path,
    show: (next) => {
      if (next === path) return;
      path = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The pane's file as the tree reads the active item: the row it marks as open. */
function paneAsActiveItem(pane: PaneFile): ActiveItemSource {
  // The same item for the same path, so the tree's reads stay stable between changes.
  let shown: { path: string | undefined; item: ItemRef | null } = { path: undefined, item: null };
  return {
    get: () => {
      const path = pane.get();
      if (path !== shown.path) shown = { path, item: path === undefined ? null : fileItem(path) };
      return shown.item;
    },
    subscribe: (listener) => pane.subscribe(listener),
  };
}

/**
 * The context the list column's tree gets. A file it opens, by a click, Enter, a new file or a
 * rename, shows in the content pane, so Code stays in its tab; a file asked for at a line, and
 * every other item, opens as the shell opens it. The tree marks the pane's file as the open one.
 * A Ctrl-click still opens the file in a new tab, through the window's own `openItemInNewTab`.
 * The content pane's file gets the same context, so a file it opens shows in the pane too.
 */
export function treeContext(context: WorkspaceContext, pane: PaneFile): WorkspaceContext {
  const { openItem } = context;
  return {
    ...context,
    activeItem: paneAsActiveItem(pane),
    openItem: (item, options) => {
      if (item.kind === FILE_KIND && options === undefined) {
        pane.show(item.id);
        return;
      }
      openItem?.(item, options);
    },
  };
}
