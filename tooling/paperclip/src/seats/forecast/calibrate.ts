/**
 * The nightly calibration (`seats.calibrate`): how many points of a seat's
 * limit a million tokens cost, per plan, model and window, split by token
 * type. A point is 1% of one seat's window. Fitted on the last 7 days of
 * 10-minute steps; a step that holds a reset or an agent moving on or off
 * the seat says nothing about the cost and is skipped.
 */

import { robustFit } from "./robust-fit.ts";
import {
  type AgentUsage,
  addTokens,
  bucketMs,
  dayMs,
  noTokens,
  type Placement,
  planOf,
  type Seat,
  type TokenCounts,
  totalTokens,
  type WindowKey,
  type WindowReading,
} from "./types.ts";

/** What a fit is for: one plan, one model, one window. */
export interface CalibrationKey {
  readonly plan: string;
  readonly model: string;
  readonly window: WindowKey;
}

export interface Calibration extends CalibrationKey {
  readonly fittedAt: string;
  /** Points per million tokens of each type. */
  readonly pointsPerMillion: TokenCounts;
  readonly quality: {
    readonly steps: number;
    /** The middle error of one step's points, as fitted. */
    readonly medianAbsError: number;
    readonly rSquared: number;
    /** Each token type's share of the tokens fitted, to compare fits on the same mix. */
    readonly mix: TokenCounts;
  };
}

/** One usable step: the points a window of a seat gained and the tokens behind them. */
export interface CalibrationStep extends CalibrationKey {
  readonly tokens: TokenCounts;
  readonly points: number;
}

export interface CalibrationInput {
  readonly now: string;
  readonly seats: readonly Seat[];
  readonly readings: readonly WindowReading[];
  /** How often the plugin reads a seat; a step may be up to twice this long. */
  readonly readIntervalMs: number;
  readonly placements: readonly Placement[];
  readonly usage: readonly AgentUsage[];
}

export const calibrationDays = 7;
/** Fewer usable steps than this make no fit: the page keeps the last one. */
export const fewestSteps = 24;
/** A fit that moved this much within a week is flagged: a plan or price may have changed. */
export const shiftLimit = 0.25;
/** Resets this close together are the same window: `/usage` prints them to the minute. */
const sameResetMs = 3_600_000;
const million = 1_000_000;

export function keyOf(key: CalibrationKey): string {
  return `${key.plan}|${key.model}|${key.window}`;
}

/** The points a token count costs under a fit. */
export function pointsFor(calibration: Calibration, tokens: TokenCounts): number {
  const rate = calibration.pointsPerMillion;
  return (
    (tokens.input * rate.input + tokens.cached * rate.cached + tokens.output * rate.output) /
    million
  );
}

/** Points per million tokens of a given mix (shares adding up to 1). */
export function ratePerMillion(calibration: Calibration, mix: TokenCounts): number {
  const rate = calibration.pointsPerMillion;
  return mix.input * rate.input + mix.cached * rate.cached + mix.output * rate.output;
}

// The same rule as the plugin's projection (#5002); import it from there once it is exported.
function resetBetween(earlier: WindowReading, later: WindowReading): boolean {
  if (later.usedPercent < earlier.usedPercent) {
    return true;
  }
  if (earlier.resetsAt === undefined || later.resetsAt === undefined) {
    return earlier.resetsAt !== later.resetsAt;
  }
  return Math.abs(Date.parse(later.resetsAt) - Date.parse(earlier.resetsAt)) >= sameResetMs;
}

function movedBetween(
  placements: readonly Placement[],
  seatId: string,
  fromMs: number,
  toMs: number,
): boolean {
  const inside = (at: string | undefined) =>
    at !== undefined && Date.parse(at) > fromMs && Date.parse(at) <= toMs;
  return placements.some((p) => p.seatId === seatId && (inside(p.from) || inside(p.to)));
}

/** Usage buckets whose middle falls between two readings, which is where their points show. */
function usageBetween(
  usage: readonly AgentUsage[],
  seatId: string,
  fromMs: number,
  toMs: number,
): AgentUsage[] {
  return usage.filter((u) => {
    const middle = Date.parse(u.bucketStart) + bucketMs / 2;
    return u.seatId === seatId && middle > fromMs && middle <= toMs;
  });
}

/**
 * The step between two consecutive readings of one window of one seat, or
 * `undefined` when it is unusable: too long, a reset, a move, no tokens, or
 * tokens from two models (whose points can't be split between them).
 */
function stepBetween(
  input: CalibrationInput,
  seat: Seat,
  earlier: WindowReading,
  later: WindowReading,
): CalibrationStep | undefined {
  const fromMs = Date.parse(earlier.at);
  const toMs = Date.parse(later.at);
  // Longer than two read intervals means a read failed in between.
  if (toMs - fromMs > 2 * input.readIntervalMs || resetBetween(earlier, later)) {
    return undefined;
  }
  if (movedBetween(input.placements, seat.id, fromMs, toMs)) {
    return undefined;
  }
  const used = usageBetween(input.usage, seat.id, fromMs, toMs);
  const models = new Set(used.map((u) => u.model));
  const [model] = models;
  if (model === undefined || models.size > 1) {
    return undefined;
  }
  return {
    plan: planOf(seat),
    model,
    window: earlier.window,
    tokens: used.reduce((sum, u) => addTokens(sum, u.tokens), noTokens),
    points: later.usedPercent - earlier.usedPercent,
  };
}

/** Every usable step of the last 7 days, for every seat and both windows. */
export function calibrationSteps(input: CalibrationInput): CalibrationStep[] {
  const nowMs = Date.parse(input.now);
  const sinceMs = nowMs - calibrationDays * dayMs;
  return input.seats.flatMap((seat) =>
    (["session", "week"] as const).flatMap((window) => {
      const readings = input.readings
        .filter((r) => r.seatId === seat.id && r.window === window)
        .filter((r) => Date.parse(r.at) >= sinceMs && Date.parse(r.at) <= nowMs)
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      return readings.slice(1).flatMap((later, index) => {
        const earlier = readings[index];
        const step = earlier === undefined ? undefined : stepBetween(input, seat, earlier, later);
        return step === undefined ? [] : [step];
      });
    }),
  );
}

function shares(tokens: TokenCounts): TokenCounts {
  const total = totalTokens(tokens);
  if (total === 0) {
    return noTokens;
  }
  return {
    input: tokens.input / total,
    cached: tokens.cached / total,
    output: tokens.output / total,
  };
}

function fitOne(
  key: CalibrationKey,
  steps: readonly CalibrationStep[],
  fittedAt: string,
): Calibration {
  const data = steps.map((s) => ({
    x: [s.tokens.input / million, s.tokens.cached / million, s.tokens.output / million],
    y: s.points,
  }));
  const fit = robustFit(data, 3);
  const [input = 0, cached = 0, output = 0] = fit.coefficients;
  return {
    ...key,
    fittedAt,
    pointsPerMillion: { input, cached, output },
    quality: {
      steps: steps.length,
      medianAbsError: fit.medianAbsResidual,
      rSquared: fit.rSquared,
      mix: shares(steps.reduce((sum, s) => addTokens(sum, s.tokens), noTokens)),
    },
  };
}

export interface CalibrationRun {
  readonly calibrations: readonly Calibration[];
  /** Plans, models and windows with too few usable steps for a fit. */
  readonly tooFewSteps: readonly (CalibrationKey & { readonly steps: number })[];
}

export function calibrate(input: CalibrationInput): CalibrationRun {
  const groups = new Map<string, CalibrationStep[]>();
  for (const step of calibrationSteps(input)) {
    groups.set(keyOf(step), [...(groups.get(keyOf(step)) ?? []), step]);
  }
  const calibrations: Calibration[] = [];
  const tooFewSteps: (CalibrationKey & { steps: number })[] = [];
  for (const steps of groups.values()) {
    const [first] = steps;
    if (first === undefined) {
      continue;
    }
    const key = { plan: first.plan, model: first.model, window: first.window };
    if (steps.length < fewestSteps) {
      tooFewSteps.push({ ...key, steps: steps.length });
    } else {
      calibrations.push(fitOne(key, steps, input.now));
    }
  }
  return { calibrations, tooFewSteps };
}

export interface CalibrationShift extends CalibrationKey {
  readonly since: string;
  /** Relative change in points per million tokens, on the new fit's token mix: 0.3 is 30% dearer. */
  readonly change: number;
}

/**
 * Fits that moved more than 25% against the oldest fit of the week before,
 * compared on the new fit's token mix so a noisy rate for a rare token type
 * doesn't raise a flag by itself.
 */
export function calibrationShifts(
  current: readonly Calibration[],
  history: readonly Calibration[],
): CalibrationShift[] {
  return current.flatMap((fit) => {
    const fittedMs = Date.parse(fit.fittedAt);
    const weekBefore = history
      .filter((old) => keyOf(old) === keyOf(fit))
      .filter(
        (old) =>
          Date.parse(old.fittedAt) < fittedMs && Date.parse(old.fittedAt) >= fittedMs - 7 * dayMs,
      )
      .sort((a, b) => Date.parse(a.fittedAt) - Date.parse(b.fittedAt));
    const oldest = weekBefore[0];
    const mix = fit.quality.mix;
    const before = oldest === undefined ? 0 : ratePerMillion(oldest, mix);
    if (oldest === undefined || before <= 0) {
      return [];
    }
    const change = ratePerMillion(fit, mix) / before - 1;
    if (Math.abs(change) <= shiftLimit) {
      return [];
    }
    return [
      { plan: fit.plan, model: fit.model, window: fit.window, since: oldest.fittedAt, change },
    ];
  });
}
