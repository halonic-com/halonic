/**
 * What the seat forecast reads. The seats plugin keeps these as its history
 * (seat readings, placements, token use per agent) and hands them over; the
 * forecast itself does no I/O. Times are ISO strings, as in the rest of the
 * plugin.
 */

/** A seat's two limit windows: the 5-hour session and the week. */
export type LimitWindow = "session" | "week";

/** Tokens split by type, because each type costs a different share of a limit. */
export interface TokenCounts {
  readonly input: number;
  readonly cached: number;
  readonly output: number;
}

/** One subscription seat. `plan` names its allowance, such as `max-20x`. */
export interface Seat {
  readonly id: string;
  readonly plan: string;
}

/** One reading of one window of one seat, in whole percent as `/usage` prints it. */
export interface SeatReading {
  readonly seatId: string;
  readonly window: LimitWindow;
  readonly at: string;
  readonly usedPercent: number;
  readonly resetsAt: string | undefined;
}

/** An agent on a seat from `from` until `to`; no `to` means it is there now. */
export interface Placement {
  readonly agentId: string;
  readonly seatId: string;
  readonly from: string;
  readonly to: string | undefined;
}

/** One agent's tokens in one 10-minute bucket, on the seat and model its runs used. */
export interface AgentUsage {
  readonly agentId: string;
  readonly seatId: string;
  readonly model: string;
  /** Start of the 10-minute bucket. */
  readonly bucketStart: string;
  readonly tokens: TokenCounts;
}

/** Length of one usage bucket and the seats plugin's reading interval. */
export const stepMs = 10 * 60_000;
export const hourMs = 3_600_000;
export const dayMs = 24 * hourMs;

export const noTokens: TokenCounts = { input: 0, cached: 0, output: 0 };

export function addTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  return { input: a.input + b.input, cached: a.cached + b.cached, output: a.output + b.output };
}

export function totalTokens(tokens: TokenCounts): number {
  return tokens.input + tokens.cached + tokens.output;
}
