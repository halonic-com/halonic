import type { PlaceSignal } from "@halonicjs/studio-shell";
import type { InboxItem } from "./inbox-items.ts";

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

/** How many items still wait for you: a fixed setup item stays in the list but doesn't wait. */
export function waitingCount(items: readonly InboxItem[]): number {
  return items.filter((item) => item.kind !== "setup" || item.fixed !== true).length;
}
