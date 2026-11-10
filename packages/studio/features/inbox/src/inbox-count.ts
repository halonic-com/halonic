import type { PlaceSignal } from "@halonicjs/studio-shell";
import type { InboxItem } from "./inbox-items.ts";

/**
 * The Inbox's count for the sidebar, Home's Needs you and the phone's bar:
 * every item that waits for you. Notices never count. The shell shows and
 * says nothing for zero.
 *
 * @example
 * inboxSignal(items); // { mark: "count", value: 2, spoken: "2 waiting" }
 */
export function inboxSignal(items: readonly InboxItem[]): PlaceSignal {
  return { mark: "count", value: items.length, spoken: `${items.length} waiting` };
}
