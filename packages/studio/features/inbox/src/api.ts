/**
 * The services and types other features may use. Features import each
 * other only through this file. Home's Needs you reads the same items and
 * count as the Inbox.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { Inbox, InboxRuns } from "./inbox.ts";
import type { InboxRequests } from "./request/inbox-requests.ts";

export { type InboxDecisions, inboxDecisions } from "./decide.ts";
export type {
  Inbox,
  InboxRuns,
  InboxSetupSource,
  InboxState,
  SetupEntry,
  SetupFocus,
  SetupViewProps,
} from "./inbox.ts";
export { inboxSignal } from "./inbox-count.ts";
export {
  type ApprovalItem,
  type InboxItem,
  inboxItems,
  isRunItem,
  type RunItem,
  type SetupItem,
  setupKey,
  type WaitItem,
} from "./inbox-items.ts";
export { clockTime } from "./plain/waiting-time.ts";
export type { InboxRequests, RequestWorkflow, StartedRun } from "./request/inbox-requests.ts";

/** The runs the Inbox reads and answers. The app provides it for each open workspace. */
export const InboxRunsService: ServiceKey<InboxRuns> = serviceKey<InboxRuns>("inbox.runs");

/** The open workspace's Inbox: its items, count and your answers. */
export const InboxService: ServiceKey<Inbox> = serviceKey<Inbox>("inbox");

/**
 * The workflows the Inbox can start as requests. The app provides it for each open workspace; without
 * it the Inbox shows no request form.
 */
export const InboxRequestsService: ServiceKey<InboxRequests> =
  serviceKey<InboxRequests>("inbox.requests");
