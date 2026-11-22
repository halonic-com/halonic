/**
 * The nightly accuracy check (`seats.accuracy`): every stored forecast is
 * scored against what the readings later showed, 1, 5 and 24 hours ahead.
 * Moves are only made automatically (phase 4) once these scores have been
 * good for two weeks, so the scores are the evidence for that step.
 */

/** One forecast as stored when it was made. */
export interface StoredForecast {
  /** What it is about, for example `seat-session` (a seat's 5-hour %), `seat-week` or `pool`. */
  readonly scope: string;
  /** Which seat, agent or pool, by id. */
  readonly subject: string;
  readonly madeAt: string;
  readonly horizonHours: number;
  readonly p50: number;
  readonly p90: number;
}

/** What a reading later showed for the same scope and subject. */
export interface Outcome {
  readonly scope: string;
  readonly subject: string;
  readonly at: string;
  readonly value: number;
}

/** How one day's forecasts of one scope and horizon did. Days are UTC, by the time forecast. */
export interface AccuracyScore {
  readonly day: string;
  readonly scope: string;
  readonly horizonHours: number;
  readonly scored: number;
  /** Middle absolute error of P50, in the scope's own unit (points for a seat). */
  readonly medianError: number;
  readonly p90Error: number;
  /** Share that fell between P50 and P90; about 0.4 when the band is right. */
  readonly insideBand: number;
  /** Share at or below P90; about 0.9 when P90 is right. */
  readonly atOrBelowP90: number;
}

export const scoredHorizons: readonly number[] = [1, 5, 24];
/** An outcome read this close to the forecast time counts for it: readings come every 10 minutes. */
export const outcomeToleranceMs = 10 * 60_000;
/** The alert: 1-hour forecasts of the 5-hour window off by more than this, as a daily median… */
export const alertMedianError = 3;
/** …on this many days in a row. */
export const alertDays = 2;
const hourMs = 3_600_000;

function quantileOf(sorted: readonly number[], share: number): number {
  if (sorted.length === 0) {
    return Number.NaN;
  }
  const position = (sorted.length - 1) * share;
  const below = sorted[Math.floor(position)] ?? 0;
  const above = sorted[Math.ceil(position)] ?? below;
  return below + (above - below) * (position - Math.floor(position));
}

/** The outcome read closest to `targetMs` for this forecast's scope and subject, if one is close enough. */
function outcomeFor(
  forecast: StoredForecast,
  targetMs: number,
  outcomes: readonly Outcome[],
): Outcome | undefined {
  let best: Outcome | undefined;
  let bestGap = outcomeToleranceMs;
  for (const outcome of outcomes) {
    if (outcome.scope !== forecast.scope || outcome.subject !== forecast.subject) {
      continue;
    }
    const gap = Math.abs(Date.parse(outcome.at) - targetMs);
    if (gap <= bestGap) {
      best = outcome;
      bestGap = gap;
    }
  }
  return best;
}

interface Scored {
  readonly day: string;
  readonly scope: string;
  readonly horizonHours: number;
  readonly error: number;
  readonly inside: boolean;
  readonly belowP90: boolean;
}

function scoreOne(forecast: StoredForecast, outcomes: readonly Outcome[]): Scored | undefined {
  const targetMs = Date.parse(forecast.madeAt) + forecast.horizonHours * hourMs;
  const outcome = outcomeFor(forecast, targetMs, outcomes);
  if (outcome === undefined) {
    return undefined;
  }
  return {
    day: new Date(targetMs).toISOString().slice(0, 10),
    scope: forecast.scope,
    horizonHours: forecast.horizonHours,
    error: Math.abs(outcome.value - forecast.p50),
    inside: outcome.value >= forecast.p50 && outcome.value <= forecast.p90,
    belowP90: outcome.value <= forecast.p90,
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
    scope: first.scope,
    horizonHours: first.horizonHours,
    scored: group.length,
    medianError: quantileOf(errors, 0.5),
    p90Error: quantileOf(errors, 0.9),
    insideBand: group.filter((s) => s.inside).length / group.length,
    atOrBelowP90: group.filter((s) => s.belowP90).length / group.length,
  };
}

/**
 * Scores per day, scope and horizon (1, 5 and 24 hours). A forecast with no
 * reading near its time (a failed read, or not yet due) isn't scored.
 */
export function scoreForecasts(
  forecasts: readonly StoredForecast[],
  outcomes: readonly Outcome[],
): AccuracyScore[] {
  const groups = new Map<string, Scored[]>();
  for (const forecast of forecasts) {
    if (!scoredHorizons.includes(forecast.horizonHours)) {
      continue;
    }
    const scored = scoreOne(forecast, outcomes);
    if (scored === undefined) {
      continue;
    }
    const key = `${scored.day}|${scored.scope}|${scored.horizonHours}`;
    groups.set(key, [...(groups.get(key) ?? []), scored]);
  }
  return [...groups.values()]
    .map(summarise)
    .filter((score) => score !== undefined)
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        a.scope.localeCompare(b.scope) ||
        a.horizonHours - b.horizonHours,
    );
}

/**
 * The days that set off the alert: the last of two days in a row (by
 * calendar) on which 1-hour forecasts of a seat's 5-hour window had a
 * median error above 3 points.
 */
export function accuracyAlerts(scores: readonly AccuracyScore[], scope = "seat-session"): string[] {
  const badDays = scores
    .filter((s) => s.scope === scope && s.horizonHours === 1 && s.medianError > alertMedianError)
    .map((s) => s.day)
    .sort();
  return badDays.filter((day) => {
    const dayMs = Date.parse(`${day}T00:00:00.000Z`);
    return Array.from({ length: alertDays - 1 }, (_, back) =>
      new Date(dayMs - (back + 1) * 24 * hourMs).toISOString().slice(0, 10),
    ).every((earlier) => badDays.includes(earlier));
  });
}

/**
 * How many days in a row, up to the newest scored day, the 1-hour forecasts
 * of a seat's 5-hour window kept a median error of 3 points or less. Phase 4
 * (automatic moves) needs 14.
 */
export function goodDaysInARow(scores: readonly AccuracyScore[], scope = "seat-session"): number {
  const days = scores
    .filter((s) => s.scope === scope && s.horizonHours === 1)
    .sort((a, b) => b.day.localeCompare(a.day));
  let streak = 0;
  for (const score of days) {
    const expected = new Date(Date.parse(`${days[0]?.day}T00:00:00.000Z`) - streak * 24 * hourMs)
      .toISOString()
      .slice(0, 10);
    if (score.day !== expected || score.medianError > alertMedianError) {
      break;
    }
    streak += 1;
  }
  return streak;
}
