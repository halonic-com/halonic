import type { MenuEntry } from "@halonicjs/studio-kit";
import type { KindWithPage } from "./file-as-item.ts";
import { filesWords } from "./files-words.ts";

/** What the items of a file's menu do. `open` and `openInNewTab` are left out where the file is already open. */
export interface FileMenuActions {
  readonly open?: () => void;
  readonly openInNewTab?: () => void;
  /** Opens the item the file defines; only for an agent's, a workflow's or a routine's file. */
  readonly openAsItem?: { readonly kind: KindWithPage; readonly open: () => void } | undefined;
  readonly rename: () => void;
  readonly remove: () => void;
  readonly copyPath: () => void;
}

/**
 * The entries of a file's menu, as the tree row and the tab's ⋮ show them: Open, Open in new
 * tab, Open as *kind*, Rename, Copy path and Delete, the item that removes, last (files flow 3.3
 * and 4.2).
 * Delete has no "…": it asks nothing and offers Undo afterwards.
 */
export function fileMenuEntries(actions: FileMenuActions): MenuEntry[] {
  const { open, openInNewTab, openAsItem } = actions;
  return [
    ...(open === undefined ? [] : [{ id: "open", label: filesWords.menu.open, onSelect: open }]),
    ...(openInNewTab === undefined
      ? []
      : [{ id: "open-new-tab", label: filesWords.menu.openInNewTab, onSelect: openInNewTab }]),
    ...(openAsItem === undefined
      ? []
      : [
          {
            id: "open-as-item",
            label: filesWords.menu.openAs(openAsItem.kind),
            onSelect: openAsItem.open,
          },
        ]),
    { id: "rename", label: filesWords.menu.rename, keys: ["F2"], onSelect: actions.rename },
    { id: "copy-path", label: filesWords.menu.copyPath, onSelect: actions.copyPath },
    {
      id: "delete",
      label: filesWords.menu.delete,
      keys: ["Delete"],
      danger: true,
      onSelect: actions.remove,
    },
  ];
}
