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
  /** Forecast points of the last 25 hours. */
  readonly points: readonly StoredForecastPoint[];
  /** The readings in that span. */
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

function dayBefore(day: string, back: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - back * dayMs).toISOString().slice(0, 10);
}

/** The reading of this point's seat and window closest to its target, if one is close enough. */
function readingFor(point: StoredForecastPoint, input: AccuracyInput): WindowReading | undefined {
  const targetMs = Date.parse(point.targetAt);
  let best: WindowReading | undefined;
  let bestGap = input.readIntervalMs;
  for (const reading of input.readings) {
    if (reading.seatId !== point.seatId || reading.window !== point.window) {
      continue;
    }
    const gap = Math.abs(Date.parse(reading.at) - targetMs);
    if (gap <= bestGap) {
      best = reading;
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

function scoreOne(point: StoredForecastPoint, input: AccuracyInput): Scored | undefined {
  const reading = readingFor(point, input);
  if (reading === undefined) {
    return undefined;
  }
  const actual = reading.usedPercent;
  return {
    day: point.targetAt.slice(0, 10),
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
 * Scores per day, window and horizon (1, 5 and 24 hours). A point with no
 * reading near its target (a failed read, or not yet due) isn't scored.
 */
export function scoreForecasts(input: AccuracyInput): AccuracyScore[] {
  const groups = new Map<string, Scored[]>();
  for (const point of input.points) {
    if (!horizons.includes(point.horizon)) {
      continue;
    }
    const scored = scoreOne(point, input);
    if (scored === undefined) {
      continue;
    }
    const key = `${scored.day}|${scored.window}|${scored.horizon}`;
    groups.set(key, [...(groups.get(key) ?? []), scored]);
  }
  return [...groups.values()]
    .map(summarise)
    .filter((score) => score !== undefined)
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) || a.window.localeCompare(b.window) || a.horizon - b.horizon,
    );
}

/** The 1-hour scores of the 5-hour window, one per day, newest first; new scores win over stored ones. */
function sessionOneHourByDay(scores: readonly AccuracyScore[]): AccuracyScore[] {
  const byDay = new Map<string, AccuracyScore>();
  for (const score of scores) {
    if (score.window === "session" && score.horizon === 60) {
      byDay.set(score.day, score);
    }
  }
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}

/**
 * Whether the newest scored day and the day before it (by calendar) both had
 * 1-hour forecasts of the 5-hour window with a median error above 3 points.
 */
export function sessionOneHourDegraded(scores: readonly AccuracyScore[]): boolean {
  const days = sessionOneHourByDay(scores);
  const newest = days[0]?.day;
  if (newest === undefined) {
    return false;
  }
  return Array.from({ length: alertDays }, (_, back) => dayBefore(newest, back)).every((day) =>
    days.some((s) => s.day === day && s.medianErrorPoints > alertMedianError),
  );
}

/**
 * How many days in a row, up to the newest scored day, the 1-hour forecasts
 * of the 5-hour window kept a median error of 3 points or less. Phase 4
 * (automatic moves) needs 14.
 */
export function goodDaysInARow(scores: readonly AccuracyScore[]): number {
  const days = sessionOneHourByDay(scores);
  const newest = days[0]?.day;
  let streak = 0;
  for (const score of days) {
    if (newest === undefined || score.day !== dayBefore(newest, streak)) {
      break;
    }
    if (score.medianErrorPoints > alertMedianError) {
      break;
    }
    streak += 1;
  }
  return streak;
}

/** The nightly run: today's scores, and the alert over them and the stored ones. */
export function accuracy(input: AccuracyInput): AccuracyReport {
  const scores = scoreForecasts(input);
  return {
    scores,
    sessionOneHourDegraded: sessionOneHourDegraded([...input.history, ...scores]),
  };
}
