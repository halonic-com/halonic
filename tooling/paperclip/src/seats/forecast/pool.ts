/**
 * The pool forecast (`seats.forecast`): how long the weekly allowance of all
 * seats together lasts at the forecast demand, and what rate it could keep
 * up for ever.
 *
 * A point is 1% of one seat's weekly window. The pool holds what is left of
 * every forecastable seat's weekly window, and each seat refills to 100 on
 * its own weekly reset. Demand is spent from the seat that resets soonest
 * first, as the Supervisor places agents, so as little as possible is lost
 * at a reset. The pool has run out when every seat is at 100% at once.
 */

import {
  addRates,
  forecastable,
  latestBy,
  noRate,
  type SeatForecastInput,
  SeatPricing,
  type SeatRate,
} from "./seat-forecast.ts";
import { dayMs, hourMs, type SeatId, type WindowReading } from "./types.ts";
import { forecastDays, type Level } from "./window-walk.ts";

/** One run's forecast of the whole pool's weekly allowance. */
export interface PoolForecast {
  /** Seats with a weekly reading; seats without one are left out. */
  readonly seats: number;
  /** Weekly points left now, over all those seats. */
  readonly pointsLeft: number;
  /** Weekly points a day at the demand of this hour. */
  readonly pointsPerDayNow: Level;
  /** Weekly points a day the seats refill: 100 per seat a week. */
  readonly sustainablePointsPerDay: number;
  readonly tokensPerDayNow: Level;
  /** Tokens a day the pool can keep up, at today's tokens per point; undefined with no priced demand. */
  readonly sustainableTokensPerDay: number | undefined;
  /**
   * When every seat is full at once; undefined when that doesn't happen within
   * `poolDays`, or when no seat has a weekly reading (`seats` is 0), so a cold
   * start never reads as a pool that has run out.
   */
  readonly runOutAtP50: string | undefined;
  readonly runOutAtP90: string | undefined;
  /** Days from now until the run-out; undefined when there is none within `poolDays`. */
  readonly headroomDaysP50: number | undefined;
  readonly headroomDaysP90: number | undefined;
}

/** How far ahead the pool is walked: two weekly resets of every seat. */
export const poolDays = 14;
const weekMs = forecastDays * dayMs;

interface SeatAllowance {
  readonly seatId: SeatId;
  left: number;
  resetMs: number;
}

/** Each seat's weekly points left now, from its latest `week` reading, rolled past any reset already due. */
function allowances(readings: readonly WindowReading[], nowMs: number): SeatAllowance[] {
  return readings.map((reading) => {
    let left = 100 - reading.usedPercent;
    let resetMs =
      reading.resetsAt === undefined
        ? Date.parse(reading.at) + weekMs
        : Date.parse(reading.resetsAt);
    while (resetMs <= nowMs) {
      left = 100;
      resetMs += weekMs;
    }
    return { seatId: reading.seatId, left, resetMs };
  });
}

/** Takes `points` from the seats, soonest reset first. */
function spend(seats: readonly SeatAllowance[], points: number): void {
  let owed = points;
  for (const seat of [...seats].sort((a, b) => a.resetMs - b.resetMs)) {
    const taken = Math.min(seat.left, owed);
    seat.left -= taken;
    owed -= taken;
  }
}

const totalLeft = (seats: readonly SeatAllowance[]) =>
  seats.reduce((sum, seat) => sum + seat.left, 0);

/**
 * Walks the pool from `nowMs` in steps that end on each whole hour and each
 * seat's reset, spending `pointsPerHour` each step. Returns when the pool is
 * empty, or undefined when it lasts `poolDays` or has no seats to walk.
 */
function runOut(
  start: readonly SeatAllowance[],
  nowMs: number,
  pointsPerHour: (atMs: number) => number,
): number | undefined {
  if (start.length === 0) {
    return undefined;
  }
  const seats = start.map((seat) => ({ ...seat }));
  const endMs = nowMs + poolDays * dayMs;
  for (let atMs = nowMs; atMs < endMs; ) {
    const left = totalLeft(seats);
    const rate = pointsPerHour(atMs);
    const nextResetMs = Math.min(...seats.map((seat) => seat.resetMs));
    const stepEndMs = Math.min((Math.floor(atMs / hourMs) + 1) * hourMs, nextResetMs, endMs);
    const points = (rate * (stepEndMs - atMs)) / hourMs;
    if (left <= 0 || points >= left) {
      return rate > 0 ? atMs + (left / rate) * hourMs : atMs;
    }
    spend(seats, points);
    for (const seat of seats.filter((candidate) => candidate.resetMs === stepEndMs)) {
      seat.left = 100;
      seat.resetMs += weekMs;
    }
    atMs = stepEndMs;
  }
  return undefined;
}

const perDay = (level: Level): Level => ({ p50: level.p50 * 24, p90: level.p90 * 24 });
const isoAt = (ms: number | undefined) =>
  ms === undefined ? undefined : new Date(ms).toISOString();
const daysFrom = (nowMs: number, ms: number | undefined) =>
  ms === undefined ? undefined : (ms - nowMs) / dayMs;

/** The pool forecast from the same input as the seat forecast. */
export function forecastPool(input: SeatForecastInput): PoolForecast {
  const nowMs = Date.parse(input.now);
  const pricing = new SeatPricing(input);
  const forecastableIds = new Set(input.seats.filter(forecastable).map((seat) => seat.id));
  const weekReadings = latestBy(
    input.readings.filter(
      (reading) => reading.window === "week" && forecastableIds.has(reading.seatId),
    ),
    (reading) => reading.seatId,
    (reading) => reading.at,
  );
  const start = allowances([...weekReadings.values()], nowMs);
  // Only the seats in the pool spend from it: an agent on a seat with no
  // weekly reading must not be charged to the other seats.
  const seats = input.seats.filter((seat) => weekReadings.has(seat.id));
  const rates = seats.map((seat) => pricing.ratePerHour(seat, "week"));
  const rateAt = (atMs: number): SeatRate =>
    rates.reduce((sum, rate) => addRates(sum, rate(atMs)), noRate);
  const now = rateAt(nowMs);
  const sustainablePointsPerDay = (start.length * 100) / forecastDays;
  const runOutP50 = runOut(start, nowMs, (atMs) => rateAt(atMs).points.p50);
  const runOutP90 = runOut(start, nowMs, (atMs) => rateAt(atMs).points.p90);
  return {
    seats: start.length,
    pointsLeft: totalLeft(start),
    pointsPerDayNow: perDay(now.points),
    sustainablePointsPerDay,
    tokensPerDayNow: perDay(now.tokens),
    sustainableTokensPerDay:
      now.points.p50 > 0 ? sustainablePointsPerDay * (now.tokens.p50 / now.points.p50) : undefined,
    runOutAtP50: isoAt(runOutP50),
    runOutAtP90: isoAt(runOutP90),
    headroomDaysP50: daysFrom(nowMs, runOutP50),
    headroomDaysP90: daysFrom(nowMs, runOutP90),
  };
}
