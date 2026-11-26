// The Inbox page's layout parts: the list's title and column, the open item's place, and the item
// the decided card's **Next** opens. Kept apart from `InboxView`, which puts them together.

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
 * The open item's column, its header over its card: beside the list, else (one pane at a time)
 * the whole page while an item or an agent's card is open, and gone while none is.
 */
export function itemPaneClass(onePane: boolean, itemOpen: boolean): string {
  return `${onePane && !itemOpen ? "hidden" : "flex"} min-w-0 flex-1 flex-col overflow-y-auto`;
}

/** A row that waits, in list order, with how many items it holds (an agents' bundle holds several). */
export interface WaitingRow {
  readonly key: string;
  readonly items: number;
}

/** How many items wait for you: the heading's count and the "of 6" in the open item's place. */
export function needsYouCount(order: readonly WaitingRow[]): number {
  return order.reduce((sum, row) => sum + row.items, 0);
}

/**
 * Where the open row is among what waits, "2 of 6", counted as the heading counts: every item,
 * agents' cards included (`inbox.one-count`). `null` for a row that doesn't wait, such as a
 * decided or done item. A bundle reads as the place of its first item.
 */
export function placeOf(key: string | undefined, order: readonly WaitingRow[]): string | null {
  const index = order.findIndex((row) => row.key === key);
  if (index === -1) return null;
  return `${needsYouCount(order.slice(0, index)) + 1} of ${needsYouCount(order)}`;
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
