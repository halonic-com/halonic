/**
 * What the `seats` plugin stores, and what the forecast functions in
 * `seats/forecast/` take as input. Agreed with the forecast on HAL-16030.
 *
 * - Times are ISO 8601 strings in UTC.
 * - Percent is whole percent 0–100, as Claude Code prints it.
 * - Tokens are the three kinds Paperclip's `cost_events` has: input, cached input, output.
 * - Usage is counted in 10-minute buckets that start on UTC :00, :10, :20 …
 * - No names, e-mails or connection ids in any record: those stay in board-only settings.
 */

/** The board's key for a seat (tests use `seat-a`, `seat-b`). */
export type SeatId = string;
/** Paperclip's agent id. */
export type AgentId = string;

/** A seat's role in the rules: only `pool` seats take agents; `paid-api` never does. */
export type SeatRole = "pool" | "reserve" | "paid-api";

export interface Seat {
  readonly id: SeatId;
  readonly role: SeatRole;
  /** The subscription Claude Code names ("max", "pro"), if known. */
  readonly plan: string | undefined;
  /** Seats that share a one-time manual reset; `undefined` when the seat has none. */
  readonly resetGroup: string | undefined;
  readonly manualResetUsed: boolean;
  readonly status: "active" | "paused";
}

/** One window at one reading. */
export interface WindowState {
  readonly usedPercent: number;
  readonly resetsAt: string | undefined;
}

/**
 * Why a read of one seat gave no windows. `signed-out` means the seat has no
 * sign-in it can use: none, one that isn't a subscription, or another account's.
 */
export type ReadError = "timeout" | "rate-limited" | "signed-out" | "unreadable";

/** One `seats.read` of one seat. A failed read keeps its error and no windows. */
export interface SeatReading {
  readonly seatId: SeatId;
  readonly at: string;
  readonly error: ReadError | undefined;
  readonly session: WindowState | undefined;
  readonly week: WindowState | undefined;
  /** Weekly windows per model, keyed by the label Claude Code prints ("Sonnet only"), unchanged. */
  readonly weekByModel: Readonly<Record<string, WindowState>>;
}

/** Who moved an agent; `observed` when the plugin saw the change in the agent's settings. */
export type PlacementSource = "supervisor" | "board" | "job" | "observed";

/** An agent on a seat from `from` until `to` (`undefined` while it still is). */
export interface Placement {
  readonly agentId: AgentId;
  readonly seatId: SeatId;
  readonly from: string;
  readonly to: string | undefined;
  readonly source: PlacementSource;
}

export interface SeatEvent {
  readonly seatId: SeatId;
  readonly kind: "manual-reset" | "weekly-reset" | "plan-change";
  readonly at: string;
  /** `board` for an action on the page (the board user's id is kept in the table, not here). */
  readonly by: "board" | "observed";
}

/**
 * One agent's tokens in one 10-minute bucket, on one seat with one model.
 *
 * The key is (agent, seat, model, bucket). Each `cost_events` row is
 * bucketed by its own time, which is when its run ended, and goes to the
 * seat the agent was on at that time. So an agent that moved inside a bucket
 * has two rows for it, and a long run lands whole in the bucket it ended in.
 */
export interface AgentUsage {
  readonly agentId: AgentId;
  /** The seat the agent was placed on at the cost row's time; `undefined` when unknown. */
  readonly seatId: SeatId | undefined;
  /** The API model id (`claude-…`), unchanged; settings map it to a `weekByModel` label. */
  readonly model: string;
  readonly bucketStart: string;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly runs: number;
}

/** What an agent has on at one instant; the forecast's idle rule and the cap scenarios read it. */
export interface AgentActivity {
  readonly agentId: AgentId;
  readonly at: string;
  readonly runningRuns: number;
  readonly queuedRuns: number;
  /** Open tasks assigned to the agent (todo, in_progress). */
  readonly openTasks: number;
  /** Concurrent run cap from the agent's settings; `undefined` when it has none. */
  readonly cap: number | undefined;
  /** The model in the agent's settings now (the same string as `AgentUsage.model`). */
  readonly model: string;
}

/**
 * How many days of each record the plugin keeps. The forecast loads 14 days
 * of usage for its hour-of-week profile, and 7 days of the rest to calibrate.
 * A placement counts from its end, so an agent's open placement is never dropped.
 */
export const retentionDays = {
  agentUsage: 14,
  agentActivity: 7,
  readings: 7,
  placements: 7,
  events: 7,
} as const;
