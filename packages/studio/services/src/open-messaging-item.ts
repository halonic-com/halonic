import type { MessagingId } from "@halonicjs/ports";

/** What kind of agent item an ID names: an Inbox item, or a Messenger conversation. */
export type MessagingItemKind = "inbox-item" | "conversation";

/** An agent item to open, such as the one a clicked notification names. */
export interface MessagingItemToOpen {
  /** The item's opaque ID, as `AgentMessaging` gives it. */
  readonly id: MessagingId;
  /** Whether it is an Inbox item or a conversation. */
  readonly kind: MessagingItemKind;
}

/** The part of the Inbox that opens an item when the page shows it (`Inbox.requestOpen`). */
export interface InboxOpenRequests {
  /** Asks the Inbox to open the item with the list's `key` once it shows. */
  requestOpen(key: string): void;
}

/** What the Studio window gives the service to show an item; either may be missing. */
export interface OpenItemWindow {
  /** The Inbox feature's service, when the Inbox is there. */
  readonly inbox: InboxOpenRequests | undefined;
  /** Shows a sidebar place, as `WorkspaceContext.openPlace` does. */
  readonly openPlace: ((place: "inbox") => void) | undefined;
}

/** Whether the item was shown, or why not. */
export type OpenItemResult = "opened" | "no-inbox" | "no-messenger";

/**
 * The Inbox list's key of an agent item. The Inbox feature owns the format (`agentItemKey`), and
 * a shared package can't import a feature, so it is repeated here; the test pins both.
 */
export function inboxKeyOf(id: MessagingId): string {
  return `agent:${id}`;
}

/**
 * Shows an agent item, such as the one a clicked notification names: the Inbox with that item
 * selected. It only shows the item; it never answers or sends anything. A conversation has nowhere
 * to open until the Messenger lands, so it says so instead.
 *
 * @param item - the item to show
 * @param window - the Inbox and the place switcher of the Studio window
 * @returns `"opened"`, or why it couldn't show the item
 */
export function openMessagingItem(
  item: MessagingItemToOpen,
  window: OpenItemWindow,
): OpenItemResult {
  if (item.kind === "conversation") return "no-messenger";
  if (window.inbox === undefined || window.openPlace === undefined) return "no-inbox";
  window.inbox.requestOpen(inboxKeyOf(item.id));
  window.openPlace("inbox");
  return "opened";
}
