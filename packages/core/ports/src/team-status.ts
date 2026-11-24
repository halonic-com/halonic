import type { MessagingAuthor, MessagingId } from "./agent-messaging.ts";

/** Version of the {@link TeamStatus} port. A breaking change bumps it and comes with an ADR. */
export const teamStatusVersion = 1;

/** When the source itself made the data, not when we asked. Apps show "As of 13:00" and warn after 30 minutes. */
export interface AsOf {
  asOf: string;
}

/** Money in whole cents, with its currency. Paid money only: subscription work is 0 here. */
export interface Money {
  cents: number;
  currency: string;
}

/** Tokens of some work, by kind. */
export interface TokenCount {
  input: number;
  cached: number;
  output: number;
}

/** The time a spend answer covers. */
export type SpendRange = "today" | "week" | "month";

/** One source's spend for a range. */
export interface SpendSummary extends AsOf {
  source: MessagingId;
  range: SpendRange;
  paid: Money;
  /** Tokens of all work, paid and subscription. Subscription work costs 0 in money, so tokens show its size. */
  tokens: TokenCount;
  /** The company's budget for the month, when one is set. */
  budget?: Money;
  /** Runs whose cost isn't priced yet ("at least $41.20"). */
  unpricedRuns: number;
}

/** One agent's spend for a range. */
export interface AgentSpend {
  agent: MessagingId;
  source: MessagingId;
  range: SpendRange;
  paid: Money;
  tokens: TokenCount;
  tokensByModel: readonly { model: string; tokens: TokenCount }[];
  /** The agent's own monthly budget, when it has one. */
  budget?: Money;
}

/** How a seat stands, as apps show it. A state a provider can't map reads as `other`. */
export type SeatState = "ok" | "near-limit" | "full" | "signed-out" | "not-read" | "other";

/** One usage window of a seat, such as its five-hour or weekly limit. */
export interface SeatWindow {
  kind: "five-hour" | "week" | "model-week" | "other";
  /** "Sonnet only" for a model window. Shown as is. */
  label: string;
  usedPercent: number;
  resetsAt?: string;
  /** When the forecast says it crosses 90%, if before its reset. */
  reaches90At?: string;
}

/** A seat, by its board label only: never its account, login folder or connection. */
export interface Seat extends AsOf {
  id: MessagingId;
  source: MessagingId;
  /** Agent-written: rendered as plain text. */
  label: string;
  role: "pool" | "reserve" | "paid-api" | "other";
  state: SeatState;
  windows: readonly SeatWindow[];
  agents: readonly MessagingId[];
  manualReset: "available" | { usedAt: string } | "none";
  /** The Seat Supervisor's open proposal, in words, with its time. Plain text; the app shows it and never carries it out. */
  proposal?: { text: string; at: string };
}

/** Where a pull request stands, as apps show it. A state a provider can't map reads as `other`. */
export type PullRequestState =
  | "draft"
  | "waiting-for-review"
  | "changes-requested"
  | "approved"
  | "approval-outdated"
  | "in-queue"
  | "failing"
  | "conflicting"
  | "dequeued"
  | "merged"
  | "closed"
  | "other";

/** A pull request, without its review or comment bodies. */
export interface PullRequest {
  id: MessagingId;
  source: MessagingId;
  /** "halonic", for the screen's title. */
  repo: string;
  /** "#5641". Shown, never used to look it up. */
  label: string;
  /** Written by whoever opened it, including outside contributors: rendered as plain text. */
  title: string;
  /** The board shows as "the board", an outside contributor or a bot as "outside contributor": never a login. */
  author: MessagingAuthor;
  /** The task its branch names, when it follows `<agent>/HAL-<n>-…`. */
  work?: MessagingId;
  reviewer?: MessagingAuthor;
  state: PullRequestState;
  /** Since when it has been in this state. Apps compute "stuck" from it. */
  since: string;
  /** The cause in words, as plain text: the failed check's name, the dequeue reason. Never log text. */
  reason?: string;
  fastTrack: boolean;
  queue?: { position: number; group?: number };
  changedLines?: number;
  /** A page to open in the system browser. Only a link `isAllowedWebLink` passes. */
  webLink?: string;
}

/** One repo's pull requests from one source. */
export interface PullRequestList extends AsOf {
  source: MessagingId;
  repo: string;
  open: readonly PullRequest[];
  /** Merged or closed in the last 24 hours. */
  recent: readonly PullRequest[];
}

/** One step in a pull request's life. */
export interface PullRequestEvent {
  at: string;
  kind:
    | "out-of-draft"
    | "check-passed"
    | "check-failed"
    | "woken"
    | "review"
    | "approved"
    | "queued"
    | "dequeued"
    | "merged"
    | "other";
  /** Words only: "typecheck", "Julian: 1 major, 2 nits", "group failed". No review or log text. */
  text: string;
}

/** A pull request with its timeline, oldest step first. */
export interface PullRequestDetail extends AsOf {
  pullRequest: PullRequest;
  timeline: readonly PullRequestEvent[];
}

/** One merge group in a queue. */
export interface MergeGroup {
  position: number;
  state: "building" | "passed" | "failed";
  since: string;
  pullRequests: readonly MessagingId[];
}

/** One repo's merge queue from one source. */
export interface MergeQueue extends AsOf {
  source: MessagingId;
  repo: string;
  health: "running" | "runners-busy" | "stopped" | "empty" | "other";
  runnerWaitMinutes?: number;
  medianMinutesToMerge?: number;
  groups: readonly MergeGroup[];
  waiting: readonly MessagingId[];
  /** Plain-text reasons, as the queue session wrote them. */
  removedToday: readonly { pullRequest: MessagingId; at: string; reason: string }[];
}

/** The parts a source can serve. A source without seats says so, and the screen says "isn't available". */
export interface TeamStatusParts {
  source: MessagingId;
  spend: boolean;
  seats: boolean;
  pullRequests: boolean;
}

/**
 * How Studio's Team screens read spend, seat use, pull requests and the
 * merge queue (requirement `ports.team-status`). It shares
 * `AgentMessaging`'s rules: opaque IDs, every item names its source
 * (the same source IDs), the engine serves it and apps reach it only
 * through Studio's services.
 *
 * Read-only by type: there is no write, so an app can never merge, queue,
 * approve, rerun, move a seat or reset one. Each answer carries its
 * source's own "as of" time. Offline, reads give the cache. Seat accounts,
 * login folders, connection IDs, logins, billing details, logs and review
 * bodies aren't in the types, so no screen can show them. Agent-written
 * text (titles, reasons, labels, proposals) is plain text, never Markdown.
 *
 * @example
 * const seats = await teamStatus.seats();
 * const full = seats.filter((seat) => seat.state === "full");
 */
export interface TeamStatus {
  parts(): Promise<readonly TeamStatusParts[]>;
  spend(range: SpendRange): Promise<readonly SpendSummary[]>;
  agentSpend(range: SpendRange): Promise<readonly AgentSpend[]>;
  seats(): Promise<readonly Seat[]>;
  pullRequests(): Promise<readonly PullRequestList[]>;
  pullRequest(id: MessagingId): Promise<PullRequestDetail | undefined>;
  mergeQueue(): Promise<readonly MergeQueue[]>;
  /** The ID of each source whose team status changed. Ends when the reader stops. */
  changes(): AsyncIterable<MessagingId>;
}
