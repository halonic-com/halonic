import type { PlaceSignal } from "@halonicjs/studio-shell";
import type { InboxItem } from "./inbox-items.ts";
import { type ReadMarks, readKey } from "./read-marks.ts";

/**
 * The Inbox's count for the sidebar, Home's Needs you and the phone's bar:
 * every item that waits for you. Notices and a fixed setup item never count. The shell shows and
 * says nothing for zero.
 *
 * @example
 * inboxSignal(items); // { mark: "count", value: 2, spoken: "2 waiting" }
 */
export function inboxSignal(items: readonly InboxItem[]): PlaceSignal {
  const waiting = waitingCount(items);
  return { mark: "count", value: waiting, spoken: `${waiting} waiting` };
}

/**
 * The Inbox's place in the sidebar and the phone's bar (`inbox.sidebar-new`): how many of the
 * items that wait are new, as the Needs you heading counts them, with the place's name semibold.
 * A screen reader hears the new items, then all that wait. Nothing shows while nothing is new.
 *
 * @example
 * inboxNewSignal(items, marks); // { mark: "new", value: 3, spoken: "3 new, 8 waiting" }
 */
export function inboxNewSignal(items: readonly InboxItem[], marks: ReadMarks): PlaceSignal {
  const waiting = items.filter(waits);
  const fresh = waiting.filter((item) => !marks.isRead(readKey(item))).length;
  return { mark: "new", value: fresh, spoken: `${fresh} new, ${waiting.length} waiting` };
}

/** How many items still wait for you: a fixed setup item stays in the list but doesn't wait. */
export function waitingCount(items: readonly InboxItem[]): number {
  return items.filter(waits).length;
}

/** Whether an item waits for you: every item but a fixed setup item. */
export function waits(item: InboxItem): boolean {
  return item.kind !== "setup" || item.fixed !== true;
}

/**
 * What a screen reader hears when Needs you goes up outside the Inbox (microcopy 19.2): the new
 * item's title, or how many came for two or more, then how many wait now.
 *
 * @example
 * needsYouNews(["Approve this reply?"], 3); // "Waiting for you: Approve this reply?. 3 waiting."
 * needsYouNews(["Approve this reply?", "Send it?"], 5); // "2 new in Needs you. 5 waiting."
 */
export function needsYouNews(titles: readonly string[], waiting: number): string {
  const [first] = titles;
  const what =
    titles.length === 1 && first !== undefined
      ? `Waiting for you: ${first}.`
      : `${titles.length} new in Needs you.`;
  return `${what} ${waiting} waiting.`;
}
