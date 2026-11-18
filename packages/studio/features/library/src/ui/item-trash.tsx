import type { ItemUsage, LibraryItemKind } from "@halonicjs/app";
import {
  Button,
  Menu,
  MoreIcon,
  TrashStrip,
  usePresentation,
  useToastStore,
} from "@halonicjs/studio-kit";
import { type ItemViewProps, PhoneTopBarActions, useInPhoneTopBar } from "@halonicjs/studio-shell";
import { useCallback, useRef, useState } from "react";
import { deleteWords, phoneCanDelete } from "../delete-words.ts";
import { itemFileRef } from "../item-file.ts";
import { LibraryItemsHostService, type RemovedLibraryItem } from "../library-items-host.ts";
import { putBack, removeItem } from "../remove-item.ts";
import { usedByLine } from "../used-by-text.ts";
import { OpenAsFileSheet } from "./open-as-file-sheet.tsx";

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
  /**
   * The page's ⋮ button with Delete, or `null` when the app gives no Library items. Under a phone
   * top bar it goes there, after the item's name, wherever the page puts it.
   */
  readonly menu: React.ReactNode;
  /** Goes on the page's title (`<h1 tabIndex={-1}>`): after Undo the page comes back with focus on it. */
  readonly titleRef: React.RefCallback<HTMLElement>;
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
  const desktop = usePresentation() === "desktop";
  const inTopBar = useInPhoneTopBar();
  const [removed, setRemoved] = useState<RemovedLibraryItem>();
  const [showingFile, setShowingFile] = useState(false);
  const { kind, hub, id, name, usage } = item;
  const movedLine = usedByLine(usage ?? noUsage);
  // Set by Undo; the page's title takes focus when it is drawn again.
  const focusTitle = useRef(false);
  const titleRef = useCallback((title: HTMLElement | null) => {
    if (title !== null && focusTitle.current) {
      focusTitle.current = false;
      title.focus();
    }
  }, []);

  const onDelete = useCallback(async () => {
    if (host === undefined) return;
    const used = usage ?? noUsage;
    await removeItem(
      host,
      toasts,
      { kind, place: { hub, id }, name, usage: used },
      {
        quiet: true,
        // Focus goes to Undo, which reads the strip's text as its description: no announcement too.
        onRemoved: setRemoved,
      },
    );
  }, [host, toasts, kind, hub, id, name, usage]);

  const onUndo = useCallback(async () => {
    if (removed === undefined) return;
    if (await putBack(removed, name, toasts)) {
      focusTitle.current = true;
      setRemoved(undefined);
      // Nothing is announced: the title takes focus and reads the name (microcopy 19.7).
    }
  }, [removed, name, toasts]);

  const entries = [
    // The desktop opens the file in a tab; a phone has no tabs, so it shows the text in a sheet.
    ...(host === undefined || (desktop && context.openItem === undefined)
      ? []
      : [
          {
            id: "open-as-file",
            label: deleteWords.openAsFile,
            onSelect: () =>
              desktop ? context.openItem?.(itemFileRef(kind, { hub, id })) : setShowingFile(true),
          },
        ]),
    ...(desktop || phoneCanDelete(kind)
      ? [{ id: "delete", label: deleteWords.delete, danger: true, onSelect: onDelete }]
      : []),
  ];
  const moreMenu = (
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
      entries={entries}
    />
  );
  const menu =
    host === undefined || entries.length === 0 ? null : (
      <>
        {inTopBar ? <PhoneTopBarActions>{moreMenu}</PhoneTopBarActions> : moreMenu}
        {showingFile && (
          <OpenAsFileSheet
            host={host}
            context={context}
            kind={kind}
            place={{ hub, id }}
            name={name}
            onClose={() => setShowingFile(false)}
          />
        )}
      </>
    );
  // Undo takes focus: the page and its ⋮ button, where focus was, are gone. The strip is the
  // first thing on the page, so it gets 16px above it, like the page's sides.
  const strip =
    removed === undefined ? null : (
      <div className="pt-4">
        <TrashStrip
          text={deleteWords.pageMoved(kind, movedLine !== undefined)}
          detail={movedLine}
          undoLabel={deleteWords.undo}
          onUndo={onUndo}
          focusUndo
        />
      </div>
    );
  return { menu, titleRef, strip };
}
