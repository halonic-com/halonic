/**
 * The services and types other features may use. Features import each
 * other only through this file. Home's Needs you reads the same items and
 * count as the Inbox.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { Inbox, InboxRuns } from "./inbox.ts";
import type { InboxNotices } from "./notices/inbox-notices.ts";
import type { InboxRequests } from "./request/inbox-requests.ts";
import type { SandboxPasses, SandboxRefusals } from "./sandbox/sandbox-setup-source.ts";

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
export { type FailedRunNotice, failedRunNotices } from "./notices/failed-run-notices.ts";
export type { InboxNotice, InboxNotices, SandboxFixedNotice } from "./notices/inbox-notices.ts";
export { clockTime } from "./plain/waiting-time.ts";
export type { InboxRequests, RequestWorkflow, StartedRun } from "./request/inbox-requests.ts";
export type { SandboxPasses, SandboxRefusals } from "./sandbox/sandbox-setup-source.ts";

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

/**
 * The notices the Inbox shows under Needs you. The app provides it for each open workspace; without
 * it the Inbox has no Notices section.
 */
export const InboxNoticesService: ServiceKey<InboxNotices> =
  serviceKey<InboxNotices>("inbox.notices");

/**
 * The runs the sandbox row reads. The app provides it for each open workspace; without it, or
 * without a `SandboxStartCheck`, the Inbox has no sandbox row.
 */
export const SandboxRefusalsService: ServiceKey<SandboxRefusals> =
  serviceKey<SandboxRefusals>("inbox.sandbox-refusals");

/**
 * Tells the Inbox when a sandbox check passed on another screen, such as a run page's **Check
 * again**, so the row moves to Notices at once. Optional: without it the row learns of a pass only
 * from its own card.
 */
export const SandboxPassesService: ServiceKey<SandboxPasses> =
  serviceKey<SandboxPasses>("inbox.sandbox-passes");
