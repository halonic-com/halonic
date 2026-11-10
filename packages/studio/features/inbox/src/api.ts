/**
 * The services and types other features may use. Features import each
 * other only through this file. Home's Needs you reads the same items and
 * count as the Inbox.
 */
export { type InboxDecisions, inboxDecisions } from "./decide.ts";
export { inboxSignal } from "./inbox-count.ts";
export { type ApprovalItem, type InboxItem, inboxItems, type WaitItem } from "./inbox-items.ts";
