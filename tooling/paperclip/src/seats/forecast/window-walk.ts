/**
 * Walks one window of one seat forward from its latest reading, hour by
 * hour and through its resets, at a rate of points per hour the caller
 * gives. It knows nothing of agents or prices; `seat-forecast.ts` does.
 */

import { type ForecastPoint, horizons } from "./accuracy.ts";
import { dayMs, hourMs, type SeatId, type WindowKey, type WindowReading } from "./types.ts";

/** The used % levels the board watches. */
export type Threshold = 80 | 90 | 100;

/** One window of one seat, from its latest reading to its reset. */
export interface SeatForecast {
  readonly seatId: SeatId;
  readonly window: WindowKey;
  readonly usedPercentNow: number;
  readonly resetsAt: string | undefined;
  readonly atResetP50: number;
  readonly atResetP90: number;
  /** When it reaches each threshold before its reset; the reading's time when it already has, undefined when it won't. */
  readonly crossings: readonly {
    readonly threshold: Threshold;
    readonly atP50: string | undefined;
    readonly atP90: string | undefined;
  }[];
  /** The used % 1, 5 and 24 hours after `now`, past any resets: what `seats.accuracy` scores. */
  readonly points: readonly ForecastPoint[];
}

/** Capacity coming free: the points a window gives back at one reset. */
export interface Refill {
  readonly seatId: SeatId;
  readonly window: WindowKey;
  readonly at: string;
  /** The forecast (P50) used % just before the reset. */
  readonly points: number;
}

/** How far ahead capacity coming free is listed; also a weekly window's length. */
export const forecastDays = 7;
/** The thresholds every forecast reports a crossing time for. */
export const thresholds: readonly Threshold[] = [80, 90, 100];
const sessionMs = 5 * hourMs;

/** Points per hour a window gains, typical and busy. P90 adds every agent's P90: all busy at once. */
export interface Level {
  readonly p50: number;
  readonly p90: number;
}

/** No points: an empty window, or a seat with no agents. */
export const empty: Level = { p50: 0, p90: 0 };

function windowLengthMs(window: WindowKey): number {
  return window === "session" ? sessionMs : forecastDays * dayMs;
}

/** A level after `hours` at `rate`; a window stops at 100%. */
function grown(level: Level, rate: Level, hours: number): Level {
  return {
    p50: Math.min(100, level.p50 + rate.p50 * hours),
    p90: Math.min(100, level.p90 + rate.p90 * hours),
  };
}

/** When a level growing at `rate` from `fromMs` reaches `threshold`, if it does by `toMs`. */
function crossingAt(
  level: number,
  rate: number,
  threshold: number,
  fromMs: number,
  toMs: number,
): number | undefined {
  if (level >= threshold || rate <= 0) {
    return undefined;
  }
  const atMs = fromMs + ((threshold - level) / rate) * hourMs;
  return atMs <= toMs ? atMs : undefined;
}

type Crossing = { threshold: Threshold; atP50: string | undefined; atP90: string | undefined };

const isoAt = (ms: number | undefined) =>
  ms === undefined ? undefined : new Date(ms).toISOString();

/**
 * Walks one window forward from its reading in steps that end on each whole
 * hour and each reset, for 7 days after `now`. At a reset the window gives
 * back what it holds and starts again from 0. A window without a reset time
 * hasn't started; it is taken to start at the reading.
 */
export class WindowWalk {
  private readonly reading: WindowReading;
  private readonly nowMs: number;
  private readonly lengthMs: number;
  private readonly firstResetMs: number;
  private level: Level;
  private resetMs: number;
  private atReset: Level;
  private readonly crossings: Crossing[];
  private readonly points: ForecastPoint[] = [];
  private readonly refills: Refill[] = [];

  constructor(reading: WindowReading, nowMs: number) {
    this.reading = reading;
    this.nowMs = nowMs;
    this.lengthMs = windowLengthMs(reading.window);
    const startMs = Date.parse(reading.at);
    let level: Level = { p50: reading.usedPercent, p90: reading.usedPercent };
    let resetMs =
      reading.resetsAt === undefined ? startMs + this.lengthMs : Date.parse(reading.resetsAt);
    while (resetMs <= startMs) {
      level = empty;
      resetMs += this.lengthMs;
    }
    this.level = level;
    this.atReset = level;
    this.resetMs = resetMs;
    this.firstResetMs = resetMs;
    this.crossings = thresholds.map((threshold) => ({
      threshold,
      atP50: level.p50 >= threshold ? reading.at : undefined,
      atP90: level.p90 >= threshold ? reading.at : undefined,
    }));
  }

  /** Walks the window at the rate `pointsPerHour` gives for each step's start. */
  run(pointsPerHour: (atMs: number) => Level): { forecast: SeatForecast; refills: Refill[] } {
    const endMs = Math.max(this.nowMs + forecastDays * dayMs, this.firstResetMs);
    for (let atMs = Date.parse(this.reading.at); atMs < endMs; ) {
      const stepEndMs = Math.min((Math.floor(atMs / hourMs) + 1) * hourMs, this.resetMs, endMs);
      this.step(atMs, stepEndMs, pointsPerHour(atMs));
      atMs = stepEndMs;
    }
    const forecast: SeatForecast = {
      seatId: this.reading.seatId,
      window: this.reading.window,
      usedPercentNow: this.reading.usedPercent,
      resetsAt: new Date(this.firstResetMs).toISOString(),
      atResetP50: this.atReset.p50,
      atResetP90: this.atReset.p90,
      crossings: this.crossings,
      points: this.points,
    };
    return { forecast, refills: this.refills };
  }

  private step(fromMs: number, toMs: number, rate: Level): void {
    if (this.resetMs === this.firstResetMs) {
      this.noteCrossings(fromMs, toMs, rate);
    }
    this.notePoints(fromMs, toMs, rate);
    this.level = grown(this.level, rate, (toMs - fromMs) / hourMs);
    if (toMs === this.resetMs) {
      this.reset();
    }
  }

  private noteCrossings(fromMs: number, toMs: number, rate: Level): void {
    for (const crossing of this.crossings) {
      const { threshold } = crossing;
      crossing.atP50 ??= isoAt(crossingAt(this.level.p50, rate.p50, threshold, fromMs, toMs));
      crossing.atP90 ??= isoAt(crossingAt(this.level.p90, rate.p90, threshold, fromMs, toMs));
    }
  }

  /** The forecast points whose target falls in this step. */
  private notePoints(fromMs: number, toMs: number, rate: Level): void {
    for (const horizon of horizons) {
      const targetMs = this.nowMs + horizon * 60_000;
      if (targetMs > fromMs && targetMs <= toMs) {
        const level = grown(this.level, rate, (targetMs - fromMs) / hourMs);
        this.points.push({ horizon, targetAt: new Date(targetMs).toISOString(), ...level });
      }
    }
  }

  /** Gives back what the window holds; only resets after `now` count as capacity coming free. */
  private reset(): void {
    if (this.resetMs === this.firstResetMs) {
      this.atReset = this.level;
    }
    if (this.resetMs > this.nowMs) {
      this.refills.push({
        seatId: this.reading.seatId,
        window: this.reading.window,
        at: new Date(this.resetMs).toISOString(),
        points: this.level.p50,
      });
    }
    this.level = empty;
    this.resetMs += this.lengthMs;
  }
}
