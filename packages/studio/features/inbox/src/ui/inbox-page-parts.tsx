// The Inbox page's layout parts: the list's title and column, a phone's bar over the open item,
// and the item the decided card's **Next** opens. Kept apart from `InboxView`, which puts them together.

import { Button } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { InboxItem } from "../inbox-items.ts";
import type { NextItem } from "./card-parts.tsx";
import { itemTitle } from "./inbox-row.tsx";

/** The props of {@link ListHeader}. */
interface ListHeaderProps {
  /** On a phone the top bar says "Inbox", so the title is for screen readers only. */
  readonly phone: boolean;
  /** One pane at a time (a phone or a narrow window): **New request** is a row under the title. */
  readonly onePane: boolean;
  readonly newRequest: ReactNode;
}

/**
 * The list's title with **New request**: beside it on a desktop, a full-width row under it with
 * one pane at a time.
 */
export function ListHeader({ phone, onePane, newRequest }: ListHeaderProps) {
  return (
    <>
      <header className={phone ? "sr-only" : "flex items-center justify-between px-4 py-3"}>
        <h1 className="text-title">Inbox</h1>
        {onePane ? null : newRequest}
      </header>
      {onePane ? newRequest : null}
    </>
  );
}

/**
 * The list's column: 360 px beside the card, else (one pane at a time) the whole page, and gone
 * while an item is open.
 */
export function listPaneClass(onePane: boolean, itemOpen: boolean): string {
  if (!onePane) return "flex w-90 shrink-0 flex-col border-e border-border";
  return `${itemOpen ? "hidden" : "flex"} w-full flex-col`;
}

/**
 * The open item's column: beside the list, else (one pane at a time) the whole page while an
 * item or an agent's card is open, and gone while none is.
 */
export function itemPaneClass(onePane: boolean, itemOpen: boolean): string {
  return `${onePane && !itemOpen ? "hidden" : "flex"} min-w-0 flex-1 justify-center overflow-y-auto`;
}

/**
 * The bar over the open item on a phone or in a narrow window, which is pushed like a page (HAL-11945 Q12): **Back to Inbox**
 * and, while the item waits, where it is among what waits ("1 of 4"). A decided or done item
 * isn't counted, so it shows no place, and nor does an agent's card (`open` is `null`).
 */
export function ItemPageBar({
  open,
  items,
  close,
}: {
  readonly open: InboxItem | null;
  readonly items: readonly InboxItem[];
  readonly close: () => void;
}) {
  const index = open === null ? -1 : items.findIndex((item) => item.key === open.key);
  return (
    <div className="flex items-center justify-between gap-3 px-2 pt-2">
      <Button variant="ghost" size="touch" onClick={close}>
        Back to Inbox
      </Button>
      {index === -1 ? null : (
        <p className="pe-2 text-small text-fg-muted">{`${index + 1} of ${items.length}`}</p>
      )}
    </div>
  );
}

/**
 * The next item for the decided card's **Next**: the one after the open one, else the first. Once
 * the open item has left the list, the one after it is the item now at `openAt`, where it was.
 */
export function nextItem(
  items: readonly InboxItem[],
  open: InboxItem,
  openAt: number,
  setOpen: (item: InboxItem) => void,
): NextItem | null {
  const others = items.filter((item) => item.key !== open.key);
  const index = items.findIndex((item) => item.key === open.key);
  const after = index === -1 ? items[openAt] : items[index + 1];
  const next = after ?? others[0];
  if (next === undefined) return null;
  return {
    title: itemTitle(next),
    left: others.length,
    open: () => setOpen(next),
  };
}
