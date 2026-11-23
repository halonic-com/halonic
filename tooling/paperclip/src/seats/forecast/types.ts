/**
 * What the seat forecast reads. The seats plugin keeps these as its history
 * (seat readings, placements, token use per agent) and hands them over; the
 * forecast itself does no I/O. Times are ISO strings, as in the rest of the
 * plugin.
 *
 * The input records are the plugin's own, from `seats/records.ts`; this file
 * adds only what the forecast needs on top of them.
 */

import type { AgentUsage, Seat, SeatId, SeatReading, WindowState } from "../records.ts";

export type {
  AgentActivity,
  AgentId,
  AgentUsage,
  Placement,
  Seat,
  SeatId,
  SeatRole,
} from "../records.ts";

/** `session`, `week`, or one per-model weekly window by its Claude Code label. */
export type WindowKey = "session" | "week" | `week:${string}`;

/** Tokens split by type, because each type costs a different share of a limit. */
export interface TokenCounts {
  readonly input: number;
  readonly cached: number;
  readonly output: number;
}

/** The plan key a seat is calibrated under: its plan, or `unknown`. */
export function planOf(seat: Seat): string {
  return seat.plan ?? "unknown";
}

/**
 * One reading of one window of one seat, in whole percent as `/usage` prints
 * it. `windowReadings()` makes these from the plugin's whole readings; a
 * failed read makes none.
 */
export interface WindowReading {
  readonly seatId: SeatId;
  readonly window: WindowKey;
  readonly at: string;
  readonly usedPercent: number;
  readonly resetsAt: string | undefined;
}

/** Splits whole seat readings into one reading per window; failed reads give none. */
export function windowReadings(readings: readonly SeatReading[]): WindowReading[] {
  return readings.flatMap((reading) => {
    if (reading.error !== undefined) {
      return [];
    }
    const windows: [WindowKey, WindowState | undefined][] = [
      ["session", reading.session],
      ["week", reading.week],
      ...Object.entries(reading.weekByModel).map(([label, state]): [WindowKey, WindowState] => [
        `week:${label}`,
        state,
      ]),
    ];
    return windows.flatMap(([window, state]) =>
      state === undefined
        ? []
        : [
            {
              seatId: reading.seatId,
              window,
              at: reading.at,
              usedPercent: state.usedPercent,
              resetsAt: state.resetsAt,
            },
          ],
    );
  });
}

/** Length of one usage bucket. Readings may come less often; see `readIntervalMs` inputs. */
export const bucketMs = 10 * 60_000;
export const hourMs = 3_600_000;
export const dayMs = 24 * hourMs;

export const noTokens: TokenCounts = { input: 0, cached: 0, output: 0 };

/** A usage row's tokens, split by type. */
export function tokensOf(usage: AgentUsage): TokenCounts {
  return { input: usage.inputTokens, cached: usage.cachedInputTokens, output: usage.outputTokens };
}

export function addTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  return { input: a.input + b.input, cached: a.cached + b.cached, output: a.output + b.output };
}

export function totalTokens(tokens: TokenCounts): number {
  return tokens.input + tokens.cached + tokens.output;
}
