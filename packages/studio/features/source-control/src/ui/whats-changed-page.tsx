import { ActionBar, Button, ChevronRightIcon } from "@halonicjs/studio-kit";
import type { ItemRef } from "@halonicjs/studio-shell";
import { useEffect, useId, useRef } from "react";
import { type ChangeItem, isOpenable } from "../change-items.ts";
import type { ChangesList } from "../changes-list.ts";
import { discardWords, itemWords, pageWords } from "../changes-words.ts";
import { ItemChanges, WaitingNote } from "./item-changes.tsx";
import { UndoPartialCallout } from "./undo-partial-callout.tsx";
import { UndoWithoutCopyDialog } from "./undo-without-copy-dialog.tsx";
import { type UndoItem, useUndoItem } from "./use-undo-item.ts";

/** Props for {@link WhatChangedPage}. */
export interface WhatChangedPageProps {
  readonly list: ChangesList;
  readonly item: ChangeItem;
  /** Whether the developer view is on: it adds Discard and "Discard this part". */
  readonly developer: boolean;
  /** Opens the item itself; without it the page has no Open button. */
  readonly openItem?: ((item: ItemRef) => void) | undefined;
  readonly onBack: () => void;
  /** On a phone (2.13) the page is pushed, with Open as a row and Undo in the bottom bar. */
  readonly phone?: boolean;
}

/**
 * What changed in one item, as its own page in this tab (checklist part 2, 2.4): Back to Changes,
 * the item's name as the `h1`, **Undo these changes** and Open workflow, then the changes of each
 * of its files. Focus starts on the heading, so a screen reader says where it is.
 *
 * On a phone (2.13) the changes are in words only, **Open Sorter** is a 48px row under them and
 * **Undo these changes** is the bottom bar; a failed roll-back's Callout comes first.
 */
export function WhatChangedPage({
  list,
  item,
  developer,
  openItem,
  onBack,
  phone = false,
}: WhatChangedPageProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const undoing = useUndoItem(list);
  const waitingId = useId();
  const headingId = useId();

  const open =
    openItem !== undefined && isOpenable(item)
      ? () => openItem({ kind: item.kind ?? "", hub: item.hub, id: item.itemId })
      : undefined;
  const title = (
    <h1 id={headingId} ref={heading} tabIndex={-1} className="text-title flex-1 outline-none">
      {item.name}
    </h1>
  );
  if (phone) {
    return (
      <section aria-labelledby={headingId} className="flex min-h-full flex-col">
        <div className="flex flex-1 flex-col gap-4 p-4">
          <BackButton onBack={onBack} phone />
          <UndoPartialCallout undoing={undoing} />
          {title}
          <ItemChanges list={list} item={item} developer={false} phone />
          {open === undefined ? null : <OpenRow name={item.name} onOpen={open} />}
          <WaitingNote list={list} id={waitingId} />
        </div>
        <ActionBar whileTyping="hide" rows={[[undoButton(list, item, undoing, waitingId)]]} />
        <UndoWithoutCopyDialog undoing={undoing} />
      </section>
    );
  }
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <BackButton onBack={onBack} phone={false} />
      <header className="flex items-center gap-3">
        {title}
        {open === undefined ? null : (
          <Button variant="secondary" size="sm" onClick={open}>
            {pageWords.openItem(item.kind ?? "")}
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          busy={undoing.busy}
          unavailable={list.merging ? { reason: waitingId } : undefined}
          onClick={() => void undoing.undo(item)}
        >
          {discardWords.undoTheseChanges}
        </Button>
      </header>
      <WaitingNote list={list} id={waitingId} />
      <UndoPartialCallout undoing={undoing} />
      <ItemChanges list={list} item={item} developer={developer} />
      <UndoWithoutCopyDialog undoing={undoing} />
    </section>
  );
}

/** Back to Changes: a 48px touch target on a phone. */
function BackButton({ onBack, phone }: { readonly onBack: () => void; readonly phone: boolean }) {
  return (
    <span className="self-start">
      <Button variant="ghost" size={phone ? "touch" : "sm"} onClick={onBack}>
        {pageWords.back}
      </Button>
    </span>
  );
}

/** The phone's way to the item itself: a 48px row, "Open Sorter ›". */
function OpenRow({ name, onOpen }: { readonly name: string; readonly onOpen: () => void }) {
  return (
    <button
      type="button"
      className="flex min-h-touch w-full items-center justify-between rounded-md text-left text-body focus-ring"
      onClick={onOpen}
    >
      {itemWords.openNamed(name)}
      <ChevronRightIcon />
    </button>
  );
}

/** The bottom bar's **Undo these changes**: busy while it runs, waiting while a Get updates is half done. */
function undoButton(list: ChangesList, item: ChangeItem, undoing: UndoItem, waitingId: string) {
  return {
    label: discardWords.undoTheseChanges,
    busy: undoing.busy,
    busyLabel: discardWords.undoingTheseChanges,
    unavailable: list.merging ? { reason: waitingId } : undefined,
    onClick: () => void undoing.undo(item),
  } as const;
}
