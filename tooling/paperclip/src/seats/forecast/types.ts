/**
 * What the seat forecast reads. The seats plugin keeps these as its history
 * (seat readings, placements, token use per agent) and hands them over; the
 * forecast itself does no I/O. Times are ISO strings, as in the rest of the
 * plugin.
 *
 * The input records are copies of the agreed seats data contract (HAL-16035)
 * until the plugin's `seats/records.ts` lands; then these copies go and the
 * imports point there. Keep the names and fields exactly as agreed.
 */

export type SeatId = string;
export type AgentId = string;

/** `session`, `week`, or one per-model weekly window by its Claude Code label. */
export type WindowKey = "session" | "week" | `week:${string}`;

/** Tokens split by type, because each type costs a different share of a limit. */
export interface TokenCounts {
  readonly input: number;
  readonly cached: number;
  readonly output: number;
}

/** A seat's role in the rules: only `pool` seats take agents; `paid-api` never does. */
export type SeatRole = "pool" | "reserve" | "paid-api";

/** One subscription seat. */
export interface Seat {
  readonly id: SeatId;
  readonly role: SeatRole;
  /** The subscription Claude Code names ("max", "pro"), if known. */
  readonly plan: string | undefined;
  /** Seats that share a one-time manual reset; undefined when the seat has none. */
  readonly resetGroup: string | undefined;
  readonly manualResetUsed: boolean;
  readonly status: "active" | "paused";
}

/** The plan key a seat is calibrated under: its plan, or `unknown`. */
export function planOf(seat: Seat): string {
  return seat.plan ?? "unknown";
}

/**
 * One reading of one window of one seat, in whole percent as `/usage` prints
 * it. The plugin's `windowReadings()` makes these from its whole readings; a
 * failed read makes none.
 */
export interface WindowReading {
  readonly seatId: SeatId;
  readonly window: WindowKey;
  readonly at: string;
  readonly usedPercent: number;
  readonly resetsAt: string | undefined;
}

/** An agent on a seat from `from` until `to`; no `to` means it is there now. */
export interface Placement {
  readonly agentId: AgentId;
  readonly seatId: SeatId;
  readonly from: string;
  readonly to: string | undefined;
  /** Who moved it; `observed` when the plugin saw the change in the agent's settings. */
  readonly source: "supervisor" | "board" | "job" | "observed";
}

/** One agent's tokens in one 10-minute bucket, on the seat and model its runs used. */
export interface AgentUsage {
  readonly agentId: AgentId;
  /** The seat the agent was on in that bucket; undefined when the plugin can't tell. */
  readonly seatId: SeatId | undefined;
  readonly model: string;
  /** Start of the 10-minute bucket. */
  readonly bucketStart: string;
  readonly tokens: TokenCounts;
  /** Runs in the bucket. The forecast doesn't use it. */
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
  /** Concurrent run cap from the agent's settings; undefined when it has none. */
  readonly cap: number | undefined;
  /** The model in the agent's settings now (the same string as `AgentUsage.model`). */
  readonly model: string;
}

/** Length of one usage bucket. Readings may come less often; see `readIntervalMs` inputs. */
export const bucketMs = 10 * 60_000;
export const hourMs = 3_600_000;
export const dayMs = 24 * hourMs;

export const noTokens: TokenCounts = { input: 0, cached: 0, output: 0 };

export function addTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  return { input: a.input + b.input, cached: a.cached + b.cached, output: a.output + b.output };
}

export function totalTokens(tokens: TokenCounts): number {
  return tokens.input + tokens.cached + tokens.output;
}
