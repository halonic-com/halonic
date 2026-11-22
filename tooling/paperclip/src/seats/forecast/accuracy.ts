/**
 * The nightly accuracy check (`seats.accuracy`): every stored forecast point
 * is scored against what the readings later showed, 1, 5 and 24 hours ahead.
 * Moves are only made automatically (phase 4) once these scores have been
 * good for two weeks, so the scores are the evidence for that step.
 */

import { dayMs, type SeatId, type WindowKey, type WindowReading } from "./types.ts";

export type HorizonMinutes = 60 | 300 | 1440;
export const horizons: readonly HorizonMinutes[] = [60, 300, 1440];

/** One forecast value `seats.accuracy` scores: a window's used % at `targetAt`. */
export interface ForecastPoint {
  readonly horizon: HorizonMinutes;
  readonly targetAt: string;
  readonly p50: number;
  readonly p90: number;
}

/** A forecast point as the plugin stores it, with the run and the seat window it is for. */
export interface StoredForecastPoint extends ForecastPoint {
  readonly madeAt: string;
  readonly seatId: SeatId;
  readonly window: WindowKey;
}

/** How one day's forecasts of one window and horizon did, over all seats. Days are UTC, by target time. */
export interface AccuracyScore {
  readonly day: string;
  readonly window: WindowKey;
  readonly horizon: HorizonMinutes;
  readonly samples: number;
  /** Middle absolute error of P50, in points. */
  readonly medianErrorPoints: number;
  readonly p90ErrorPoints: number;
  /** Share of results with p50 <= actual <= p90, 0–1; about 0.4 when the band is right. */
  readonly insideBand: number;
}

export interface AccuracyReport {
  readonly scores: readonly AccuracyScore[];
  /** True when the 1 h forecast of `session` had a median error above 3 on each of the last 2 days. */
  readonly sessionOneHourDegraded: boolean;
}

export interface AccuracyInput {
  /**
   * The whole UTC day to score, "2026-11-21": the nightly job scores
   * yesterday. Scoring a day that is still running would let its first few
   * hours decide the alert and the streak.
   */
  readonly day: string;
  /** Forecast points whose `targetAt` falls in `day` (loaded by target time, not by `madeAt`); others are ignored. */
  readonly points: readonly StoredForecastPoint[];
  /** The readings of `day`, plus one read interval on each side. */
  readonly readings: readonly WindowReading[];
  /** How often the plugin reads a seat; a reading this close to a target counts for it. */
  readonly readIntervalMs: number;
  /** Scores stored by earlier runs, for the two-day alert. */
  readonly history: readonly AccuracyScore[];
}

/** The alert: 1-hour forecasts of the 5-hour window off by more than this, as a daily median… */
export const alertMedianError = 3;
/** …on this many days in a row. */
export const alertDays = 2;

function quantileOf(sorted: readonly number[], share: number): number {
  if (sorted.length === 0) {
    return Number.NaN;
  }
  const position = (sorted.length - 1) * share;
  const below = sorted[Math.floor(position)] ?? 0;
  const above = sorted[Math.ceil(position)] ?? below;
  return below + (above - below) * (position - Math.floor(position));
}

function dayOf(at: string): string {
  return at.slice(0, "2026-11-21".length);
}

function dayBefore(day: string, back: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - back * dayMs).toISOString().slice(0, 10);
}

/** A reading with its time parsed once. */
interface TimedReading {
  readonly reading: WindowReading;
  readonly ms: number;
}

/** The readings of each seat window, so a point looks only at its own (about 150 a day). */
type ReadingsByWindow = ReadonlyMap<string, readonly TimedReading[]>;

function windowKeyOf(at: { readonly seatId: SeatId; readonly window: WindowKey }): string {
  return `${at.seatId}|${at.window}`;
}

function readingsByWindow(readings: readonly WindowReading[]): ReadingsByWindow {
  const byWindow = new Map<string, TimedReading[]>();
  for (const reading of readings) {
    const timed = { reading, ms: Date.parse(reading.at) };
    const group = byWindow.get(windowKeyOf(reading));
    if (group === undefined) {
      byWindow.set(windowKeyOf(reading), [timed]);
    } else {
      group.push(timed);
    }
  }
  return byWindow;
}

/** The reading of this point's seat and window closest to its target, if one is close enough. */
function readingFor(
  point: StoredForecastPoint,
  readings: ReadingsByWindow,
  readIntervalMs: number,
): WindowReading | undefined {
  const targetMs = Date.parse(point.targetAt);
  let best: WindowReading | undefined;
  let bestGap = readIntervalMs;
  for (const timed of readings.get(windowKeyOf(point)) ?? []) {
    const gap = Math.abs(timed.ms - targetMs);
    if (gap <= bestGap) {
      best = timed.reading;
      bestGap = gap;
    }
  }
  return best;
}

interface Scored {
  readonly day: string;
  readonly window: WindowKey;
  readonly horizon: HorizonMinutes;
  readonly error: number;
  readonly inside: boolean;
}

function scoreOne(
  point: StoredForecastPoint,
  readings: ReadingsByWindow,
  readIntervalMs: number,
): Scored | undefined {
  const reading = readingFor(point, readings, readIntervalMs);
  if (reading === undefined) {
    return undefined;
  }
  const actual = reading.usedPercent;
  return {
    day: dayOf(point.targetAt),
    window: point.window,
    horizon: point.horizon,
    error: Math.abs(actual - point.p50),
    inside: actual >= point.p50 && actual <= point.p90,
  };
}

function summarise(group: readonly Scored[]): AccuracyScore | undefined {
  const [first] = group;
  if (first === undefined) {
    return undefined;
  }
  const errors = group.map((s) => s.error).sort((a, b) => a - b);
  return {
    day: first.day,
    window: first.window,
    horizon: first.horizon,
    samples: group.length,
    medianErrorPoints: quantileOf(errors, 0.5),
    p90ErrorPoints: quantileOf(errors, 0.9),
    insideBand: group.filter((s) => s.inside).length / group.length,
  };
}

/**
 * Scores of `input.day` per window and horizon (1, 5 and 24 hours). A point
 * targeting another day, or with no reading near its target (a failed read),
 * isn't scored.
 */
export function scoreForecasts(input: AccuracyInput): AccuracyScore[] {
  const readings = readingsByWindow(input.readings);
  const groups = new Map<string, Scored[]>();
  for (const point of input.points) {
    if (!horizons.includes(point.horizon) || dayOf(point.targetAt) !== input.day) {
      continue;
    }
    const scored = scoreOne(point, readings, input.readIntervalMs);
    if (scored === undefined) {
      continue;
    }
    const key = `${scored.window}|${scored.horizon}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [scored]);
    } else {
      group.push(scored);
    }
  }
  return [...groups.values()]
    .map(summarise)
    .filter((score) => score !== undefined)
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) || a.window.localeCompare(b.window) || a.horizon - b.horizon,
    );
}

/** The 1-hour median error of the 5-hour window per day; later scores win over earlier ones. */
function sessionOneHourByDay(scores: readonly AccuracyScore[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const score of scores) {
    if (score.window === "session" && score.horizon === 60) {
      byDay.set(score.day, score.medianErrorPoints);
    }
  }
  return byDay;
}

/**
 * Whether `day` and the day before it both had 1-hour forecasts of the
 * 5-hour window with a median error above 3 points. A day with no score
 * doesn't count as bad.
 */
export function sessionOneHourDegraded(scores: readonly AccuracyScore[], day: string): boolean {
  const byDay = sessionOneHourByDay(scores);
  return Array.from({ length: alertDays }, (_, back) => dayBefore(day, back)).every(
    (scored) => (byDay.get(scored) ?? 0) > alertMedianError,
  );
}

/**
 * How many days in a row, ending on `day`, the 1-hour forecasts of the
 * 5-hour window kept a median error of 3 points or less. A day with no score
 * ends the streak. Phase 4 (automatic moves) needs 14.
 */
export function goodDaysInARow(scores: readonly AccuracyScore[], day: string): number {
  const byDay = sessionOneHourByDay(scores);
  let streak = 0;
  for (;;) {
    const error = byDay.get(dayBefore(day, streak));
    if (error === undefined || error > alertMedianError) {
      return streak;
    }
    streak += 1;
  }
}

/** The nightly run: the scores of `input.day`, and the alert over them and the stored ones. */
export function accuracy(input: AccuracyInput): AccuracyReport {
  const scores = scoreForecasts(input);
  return {
    scores,
    sessionOneHourDegraded: sessionOneHourDegraded([...input.history, ...scores], input.day),
  };
}
