/**
 * The services and types other features may use. Features import each
 * other only through this file. Home's Needs you reads the same items and
 * count as the Inbox.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { Inbox, InboxRuns } from "./inbox.ts";
import type { InboxNotices } from "./notices/inbox-notices.ts";
import type { ProposalDecisions } from "./proposal-decisions.ts";
import type { InboxRequests } from "./request/inbox-requests.ts";
import type { HeldAgents } from "./sandbox/on-hold-setup-source.ts";
import type { SandboxPasses, SandboxRefusals } from "./sandbox/sandbox-setup-source.ts";

export { clockTime } from "@halonicjs/studio-kit";
export { AnswerElsewhere } from "./answer-elsewhere.ts";
export type { AnsweredViewProps, InboxAnsweredView } from "./answered-view.ts";
export { type AfterAnswer, type InboxDecisions, inboxDecisions } from "./decide.ts";
export type { Inbox, InboxRuns, InboxState } from "./inbox.ts";
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
export { ShownRuns } from "./needs-you-news.ts";
export {
  type BudgetNoticeFacts,
  budgetNotices,
  type MonthBudgetNotice,
  type MonthBudgetUse,
  monthBudgetLine,
  monthBudgetReached,
  monthBudgetUse,
  monthBudgetUsedUp,
  type RunBudgetNotice,
} from "./notices/budget-notices.ts";
export { type FailedRunNotice, failedRunNotices } from "./notices/failed-run-notices.ts";
export type { InboxNotice, InboxNotices, SandboxFixedNotice } from "./notices/inbox-notices.ts";
export { newestFirst as newestNoticeFirst } from "./notices/merge-notices.ts";
export {
  type ProposalCompare,
  type ProposalCompareChoice,
  type ProposalDecided,
  type ProposalDecisions,
  ProposalFailedError,
  type ProposalFailure,
  ProposalGoneError,
  type ProposalUndone,
} from "./proposal-decisions.ts";
export type {
  ProposalEnding,
  ProposalFile,
  ProposalItem,
  RunProposalEntry,
} from "./proposal-items.ts";
export {
  BudgetUsedUp,
  type InboxRequests,
  type RequestWorkflow,
  type StartedRun,
} from "./request/inbox-requests.ts";
export type {
  HeldAgent,
  HeldAgentRef,
  HeldAgents,
  HeldAgentsList,
} from "./sandbox/on-hold-setup-source.ts";
export type { SandboxPasses, SandboxRefusals } from "./sandbox/sandbox-setup-source.ts";
export type {
  InboxSetupSource,
  SetupEntry,
  SetupFocus,
  SetupViewProps,
} from "./setup-source.ts";
export { PlanLimitCard, type PlanLimitCardProps } from "./ui/plan-limit-card.tsx";
export { WaitCard, type WaitCardProps } from "./ui/wait-card.tsx";

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
 * The agents whose On this computer choice is on hold and that a routine ran in the sandbox since,
 * one Inbox row each (checklist 3.8). The app provides it for each open workspace where Studio can
 * choose where an agent runs; without it the Inbox has no on-hold rows.
 */
export const HeldAgentsService: ServiceKey<HeldAgents> =
  serviceKey<HeldAgents>("inbox.held-agents");

/**
 * Tells the Inbox when a sandbox check passed on another screen, such as a run page's **Check
 * again**, so the row moves to Notices at once. Optional: without it the row learns of a pass only
 * from its own card.
 */
export const SandboxPassesService: ServiceKey<SandboxPasses> =
  serviceKey<SandboxPasses>("inbox.sandbox-passes");

/**
 * Accept, Reject and Undo on the workspace's run proposals. The app provides it with the agent
 * host, where it lists proposals; without it Needs you says they show only in the desktop app or
 * in a terminal on your computer, and a proposal opens with its changes and the terminal command
 * that decides them (HAL-15986).
 */
export const ProposalDecisionsService: ServiceKey<ProposalDecisions> =
  serviceKey<ProposalDecisions>("inbox.proposal-decisions");
