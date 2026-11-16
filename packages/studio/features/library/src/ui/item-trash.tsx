import type { ItemUsage, LibraryItemKind } from "@halonicjs/app";
import { Button, Menu, MoreIcon, useToastStore } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { useCallback, useState } from "react";
import { deleteWords } from "../delete-words.ts";
import { LibraryItemsHostService, type RemovedLibraryItem } from "../library-items-host.ts";
import { putBack, removeItem } from "../remove-item.ts";

/** What an open item page knows of itself, for deleting it. */
export interface TrashableItem {
  readonly kind: LibraryItemKind;
  readonly hub: string | null;
  readonly id: string;
  /** The name the page shows. */
  readonly name: string;
  /** Who uses it, once the page has read it. */
  readonly usage?: ItemUsage;
}

/** What {@link useItemTrash} gives a page. */
export interface ItemTrash {
  /** The page's ⋮ button with Delete, or `null` when the app gives no Library items. */
  readonly menu: React.ReactNode;
  /** The strip that replaces the "isn't in this workspace any more" state after Delete, or `null`. */
  readonly strip: React.ReactNode;
}

const noUsage: ItemUsage = { agents: [], hubs: [], routines: [], collections: [] };

/**
 * Delete for an open item page (flow-library 4): the ⋮ menu, and, once the item is in the trash,
 * a strip with Undo that stands where "isn't in this workspace any more" would. A page whose item
 * went some other way still shows that state.
 */
export function useItemTrash(context: ItemViewProps["context"], item: TrashableItem): ItemTrash {
  const host = context.services.find(LibraryItemsHostService);
  const toasts = useToastStore();
  const [removed, setRemoved] = useState<RemovedLibraryItem>();
  const { kind, hub, id, name, usage } = item;

  const onDelete = useCallback(async () => {
    if (host === undefined) return;
    await removeItem(
      host,
      toasts,
      { kind, place: { hub, id }, name, usage: usage ?? noUsage },
      { quiet: true, onRemoved: setRemoved },
    );
  }, [host, toasts, kind, hub, id, name, usage]);

  const onUndo = useCallback(async () => {
    if (removed === undefined) return;
    if (await putBack(removed, name, toasts)) setRemoved(undefined);
  }, [removed, name, toasts]);

  const menu =
    host === undefined ? null : (
      <Menu
        align="end"
        trigger={(props) => (
          <Button
            {...props}
            variant="ghost"
            icon={<MoreIcon />}
            label={deleteWords.pageMenuLabel(name)}
          />
        )}
        entries={[{ id: "delete", label: deleteWords.delete, danger: true, onSelect: onDelete }]}
      />
    );
  const strip =
    removed === undefined ? null : (
      <p role="status" className="flex flex-wrap items-center gap-2 px-4 py-5">
        {deleteWords.pageMoved(kind)}
        <Button variant="ghost" onClick={() => void onUndo()}>
          {deleteWords.undo}
        </Button>
      </p>
    );
  return { menu, strip };
}
