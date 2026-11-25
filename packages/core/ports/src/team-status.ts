import type { MessagingAuthor, MessagingId } from "./agent-messaging.ts";
import type { TeamRuns, TeamRunsQuery } from "./team-runs.ts";

/** Version of the {@link TeamStatus} port. A breaking change bumps it and comes with an ADR. */
export const teamStatusVersion = 1;

/** When the source itself made the data, not when we asked. Apps show "As of 13:00" and warn after 30 minutes. */
export interface AsOf {
  asOf: string;
  /**
   * True when the engine answered from its offline cache; `asOf` is still the
   * source's time for the cached data. Left out when the answer is live, and by
   * a source older than this field. Each answer says it for itself, so seats can
   * come from the cache while spend is live.
   */
  fromCache?: boolean;
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
  /**
   * Runs counted in `paid` and `tokens` whose seat isn't known ("Seat unknown
   * for 3 runs"). Never negative. Left out by a source that can't tell.
   */
  unknownSeatRuns?: number;
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

/** Why a seat's newest reading failed. A cause a provider can't map reads as `other`. */
export type SeatReadCause = "rate-limited" | "other";

/**
 * A seat, by its board label only: never its account, login folder or connection.
 *
 * When its newest reading failed, `failedRead` says why and when, `state` is
 * `"not-read"`, and `windows` and `asOf` stay the last good reading's, so an
 * app shows "Not read · rate-limited · last good 12:20" with those numbers.
 */
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
  /** The newest reading failed: its cause and when. Only with `state: "not-read"`. */
  failedRead?: { cause: SeatReadCause; at: string };
  /** Each agent's share of the seat's week, in percent. Left out by a source that can't tell. */
  agentShares?: readonly { agent: MessagingId; weekPercent: number }[];
  /** The plan's plain-text label, such as "Max". Never an account or billing detail. */
  plan?: string;
  /** Plain-text label of the seats that share one manual reset. */
  manualResetGroup?: string;
  /** A page to open in the system browser. Only a link `isAllowedWebLink` passes. */
  webLink?: string;
}

/** Who moved an agent to its seat. Never a login or a name: a mover the port doesn't name reads as `other`. */
export type SeatMover = "seat-supervisor" | "board" | "observed" | "other";

/** Why a run failed. A cause a provider can't map reads as `other`. */
export type RunFailCause = "time-out" | "spend-limit" | "no-identity" | "adapter-error" | "other";

/**
 * One agent's detail for a range, for its detail page. Every field is
 * optional: a source leaves out what it can't tell, and the page leaves
 * out those rows. Counts only: no titles, logs or review text.
 */
export interface AgentDetail extends AsOf {
  /** The seat the agent is on now, since when, and who moved it there. */
  seatNow?: { seat: MessagingId; since: string; movedBy: SeatMover };
  /** The seats the agent used in the range, oldest first. `to` is left out while it is still on it. */
  seatHistory?: readonly { seat: MessagingId; from: string; to?: string }[];
  runs?: { total: number; failedByCause: readonly { cause: RunFailCause; count: number }[] };
  produced?: { pullRequestsMerged: number; tasksDone: number };
  /** A page to open in the system browser. Only a link `isAllowedWebLink` passes. */
  webLink?: string;
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
  /**
   * One agent's detail for a range, or `undefined` when the source doesn't
   * know the agent. Optional: a caller checks that it exists, and a source
   * without it is still a whole `TeamStatus`.
   */
  agent?(id: MessagingId, range: SpendRange): Promise<AgentDetail | undefined>;
  /**
   * The team agents' runs (requirement `ports.team-runs`), one answer per
   * source. Optional, as `agent` is: a source without it serves no runs.
   */
  runs?(query: TeamRunsQuery): Promise<readonly TeamRuns[]>;
  /** The ID of each source whose team status changed. Ends when the reader stops. */
  changes(): AsyncIterable<MessagingId>;
}
