/**
 * The services and types other features may use. Features import each
 * other only through this file. Home's Needs you reads the same items and
 * count as the Inbox.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { Inbox, InboxRuns } from "./inbox.ts";

export { type InboxDecisions, inboxDecisions } from "./decide.ts";
export type { Inbox, InboxRuns, InboxState } from "./inbox.ts";
export { inboxSignal } from "./inbox-count.ts";
export { type ApprovalItem, type InboxItem, inboxItems, type WaitItem } from "./inbox-items.ts";

/** The runs the Inbox reads and answers. The app provides it for each open workspace. */
export const InboxRunsService: ServiceKey<InboxRuns> = serviceKey<InboxRuns>("inbox.runs");

/** The open workspace's Inbox: its items, count and your answers. */
export const InboxService: ServiceKey<Inbox> = serviceKey<Inbox>("inbox");
