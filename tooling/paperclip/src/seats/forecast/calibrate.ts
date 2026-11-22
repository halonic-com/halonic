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

/** The token types a fit prices separately. */
export type TokenKind = keyof TokenCounts;

/** What a fit is for: one plan, one model, one window. */
export interface CalibrationKey {
  readonly plan: string;
  readonly model: string;
  readonly window: WindowKey;
}

/** One nightly fit, as the plugin stores it (the forecast contract on HAL-16030). */
export interface Calibration extends CalibrationKey {
  /** The UTC day the fit was made, "2026-11-22". With plan, model and window it is the key. */
  readonly day: string;
  /** The first and last usage bucket the fit used. */
  readonly from: string;
  readonly to: string;
  readonly pointsPerMillion: Readonly<Record<TokenKind, number>>;
  readonly quality: {
    /** 10-minute steps used, after skipping resets, moves and gaps. */
    readonly steps: number;
    readonly medianErrorPoints: number;
    readonly p90ErrorPoints: number;
  };
  /** Change against the fit of the week before, on this fit's token mix (0.3 is 30% dearer); undefined when there is none. */
  readonly weekShift: number | undefined;
  /** `weekShift` is more than 25% either way: a plan or price may have changed. */
  readonly shifted: boolean;
}

/** One usable step: the points a window of a seat gained and the tokens behind them. */
export interface CalibrationStep extends CalibrationKey {
  /** The first and last usage bucket in the step. */
  readonly from: string;
  readonly to: string;
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
  /** Fits of the last 8 days, to measure each new fit's shift against the week before. */
  readonly history: readonly Calibration[];
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

/** The points a token count costs at a fit's rates (`calibration.pointsPerMillion`). */
export function pointsFor(rate: Readonly<Record<TokenKind, number>>, tokens: TokenCounts): number {
  return (
    (tokens.input * rate.input + tokens.cached * rate.cached + tokens.output * rate.output) /
    million
  );
}

/** Points per million tokens of a given mix (shares adding up to 1). */
function ratePerMillion(rate: Readonly<Record<TokenKind, number>>, mix: TokenCounts): number {
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
  const buckets = used.map((u) => u.bucketStart).sort();
  return {
    plan: planOf(seat),
    model,
    window: earlier.window,
    from: buckets[0] ?? earlier.at,
    to: buckets.at(-1) ?? earlier.at,
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

/** The value 90% of `values` are at or below (nearest rank). */
function p90(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(0.9 * sorted.length) - 1] ?? Number.NaN;
}

function dayOf(at: string): string {
  return at.slice(0, "2026-11-22".length);
}

/**
 * The change against the oldest fit of the 7 days before, compared on the new
 * steps' token mix so a noisy rate for a rare token type doesn't move it by
 * itself. Undefined when there is no fit to compare with.
 */
function weekShift(
  key: CalibrationKey,
  day: string,
  rates: Readonly<Record<TokenKind, number>>,
  mix: TokenCounts,
  history: readonly Calibration[],
): number | undefined {
  const dayMsOf = (d: string) => Date.parse(`${d}T00:00:00.000Z`);
  const weekBefore = history
    .filter((old) => keyOf(old) === keyOf(key))
    .filter((old) => old.day < day && dayMsOf(old.day) >= dayMsOf(day) - 7 * dayMs)
    .sort((a, b) => a.day.localeCompare(b.day));
  const oldest = weekBefore[0];
  const before = oldest === undefined ? 0 : ratePerMillion(oldest.pointsPerMillion, mix);
  return before > 0 ? ratePerMillion(rates, mix) / before - 1 : undefined;
}

function fitOne(
  key: CalibrationKey,
  steps: readonly CalibrationStep[],
  input: CalibrationInput,
): Calibration {
  const data = steps.map((s) => ({
    x: [s.tokens.input / million, s.tokens.cached / million, s.tokens.output / million],
    y: s.points,
  }));
  const fit = robustFit(data, 3);
  const [inputRate = 0, cachedRate = 0, outputRate = 0] = fit.coefficients;
  const pointsPerMillion = { input: inputRate, cached: cachedRate, output: outputRate };
  const errors = steps.map((s) => Math.abs(s.points - pointsFor(pointsPerMillion, s.tokens)));
  const mix = shares(steps.reduce((sum, s) => addTokens(sum, s.tokens), noTokens));
  const day = dayOf(input.now);
  const shift = weekShift(key, day, pointsPerMillion, mix, input.history);
  return {
    ...key,
    day,
    from: steps.map((s) => s.from).sort()[0] ?? input.now,
    to:
      steps
        .map((s) => s.to)
        .sort()
        .at(-1) ?? input.now,
    pointsPerMillion,
    quality: {
      steps: steps.length,
      medianErrorPoints: fit.medianAbsResidual,
      p90ErrorPoints: p90(errors),
    },
    weekShift: shift,
    shifted: shift !== undefined && Math.abs(shift) > shiftLimit,
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
      calibrations.push(fitOne(key, steps, input));
    }
  }
  return { calibrations, tooFewSteps };
}
