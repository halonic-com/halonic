import type { MessagingAuthor, MessagingId } from "./agent-messaging.ts";

/** Version of the {@link TeamStatus} port. A breaking change bumps it and comes with an ADR. */
export const teamStatusVersion = 1;

/** When the source itself made the data, not when it was asked. Apps show "As of 13:00" and warn after 30 minutes. */
export interface AsOf {
  asOf: string;
}

/** Money in whole cents, with its currency. Paid money only: subscription work is 0 here. */
export interface Money {
  cents: number;
  currency: string;
}

/** Tokens of some work, split the way providers bill them. */
export interface TokenCount {
  input: number;
  cached: number;
  output: number;
}

/** The time a spend read covers, ending now. */
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
  /** Runs whose cost isn't priced yet, so `paid` is a lower bound ("at least $41.20"). */
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
  /** When the forecast says it crosses 90%, if that is before its reset. */
  reaches90At?: string;
}

/**
 * A seat, by its board label only: never its account, login folder or
 * connection, so no screen and no phone can show them. `label` and
 * `proposal.text` are agent-written and rendered as plain text.
 */
export interface Seat extends AsOf {
  id: MessagingId;
  source: MessagingId;
  label: string;
  role: "pool" | "reserve" | "paid-api" | "other";
  state: SeatState;
  windows: readonly SeatWindow[];
  agents: readonly MessagingId[];
  manualReset: "available" | { usedAt: string } | "none";
  /** The Seat Supervisor's open proposal, in words, with its time. The app shows it and never carries it out. */
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

/** One pull request. `title` and `reason` are written by whoever opened it or ran it, and rendered as plain text. */
export interface PullRequest {
  id: MessagingId;
  source: MessagingId;
  /** "halonic", for the screen's title. */
  repo: string;
  /** "#5641". Shown, never used to look it up. */
  label: string;
  title: string;
  author: MessagingAuthor;
  /** The work its branch names, when it follows `<agent>/HAL-<n>-…`. */
  work?: MessagingId;
  reviewer?: MessagingAuthor;
  state: PullRequestState;
  /** Since when it has been in this state. Apps work out "stuck" from it. */
  since: string;
  /** The cause in words: the failed check's name, the queue's reason for removing it. Never log text. */
  reason?: string;
  fastTrack: boolean;
  queue?: { position: number; group?: number };
  changedLines?: number;
  /** A web page to open in the system browser, only if {@link isAllowedWebLink} allows it. */
  webLink?: string;
}

/** One repository's pull requests in a source. */
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

/** One group the merge queue is building or has built. */
export interface MergeGroup {
  position: number;
  state: "building" | "passed" | "failed";
  since: string;
  pullRequests: readonly MessagingId[];
}

/** One repository's merge queue in a source. */
export interface MergeQueue extends AsOf {
  source: MessagingId;
  repo: string;
  health: "running" | "runners-busy" | "stopped" | "empty" | "other";
  runnerWaitMinutes?: number;
  medianMinutesToMerge?: number;
  groups: readonly MergeGroup[];
  waiting: readonly MessagingId[];
  removedToday: readonly { pullRequest: MessagingId; at: string; reason: string }[];
}

/** The parts a source can serve. A source without seats says so, and the screen says it isn't available. */
export interface TeamStatusParts {
  source: MessagingId;
  spend: boolean;
  seats: boolean;
  pullRequests: boolean;
}

/**
 * How Studio's Team screens read spend, seat use, pull requests and the
 * merge queue (requirement `ports.team-status`). It is read-only: there is
 * no write of any kind, so the apps never merge, queue, reset or move a
 * seat. It shares {@link MessagingId}s and sources with `AgentMessaging`,
 * and the engine serves it the same way on the desktop and on a server.
 *
 * Each answer carries its source's own "as of" time. Offline, reads give
 * the cache. A source serves only the parts {@link TeamStatus.parts} names,
 * and the reads give nothing from it for the others.
 *
 * @example
 * const [seats, parts] = await Promise.all([status.seats(), status.parts()]);
 * const full = seats.filter((seat) => seat.state === "full");
 */
export interface TeamStatus {
  parts(): Promise<readonly TeamStatusParts[]>;
  spend(range: SpendRange): Promise<readonly SpendSummary[]>;
  agentSpend(range: SpendRange): Promise<readonly AgentSpend[]>;
  seats(): Promise<readonly Seat[]>;
  pullRequests(): Promise<readonly PullRequestList[]>;
  /** One pull request with its timeline, or `undefined` when no source has it. */
  pullRequest(id: MessagingId): Promise<PullRequestDetail | undefined>;
  mergeQueue(): Promise<readonly MergeQueue[]>;
  /** The ID of each source whose team status changed. Ends when the reader stops. */
  changes(): AsyncIterable<MessagingId>;
}
