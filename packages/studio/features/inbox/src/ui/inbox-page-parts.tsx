// The Inbox page's layout parts: the list's title and column, and the item the decided card's
// **Next** opens. Kept apart from `InboxView`, which puts them together.

import type { ReactNode } from "react";
import type { InboxItem } from "../inbox-items.ts";
import type { NextItem } from "./card-parts.tsx";
import { itemTitle } from "./inbox-row.tsx";

/** The list's title with **New request**: beside it on a desktop, a full-width row under it on a phone. */
export function ListHeader({ phone, newRequest }: { phone: boolean; newRequest: ReactNode }) {
  return (
    <>
      <header className={phone ? "sr-only" : "flex items-center justify-between px-4 py-3"}>
        <h1 className="text-title">Inbox</h1>
        {phone ? null : newRequest}
      </header>
      {phone ? newRequest : null}
    </>
  );
}

/** The list's column: 360 px beside the card, the whole page on a phone, and gone while an item is open. */
export function listPaneClass(phone: boolean, itemOpen: boolean): string {
  if (!phone) return "flex w-90 shrink-0 flex-col border-e border-border";
  return `${itemOpen ? "hidden" : "flex"} w-full flex-col`;
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
