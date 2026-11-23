/**
 * How many tokens an agent will use, hour by hour (`seats.forecast`). Seats
 * don't use tokens, agents do: the forecast models each agent and adds its
 * demand to whichever seat it is on, so a move changes the seat's forecast
 * at once instead of spoiling the seat's own rate.
 *
 * An agent's demand for an hour blends where it is now (its last 2 hours, or
 * its idle rate when it has no work) with what it usually does in that hour
 * of the week (its last 14 days), moving from the first to the second as the
 * hour gets further away.
 */

import { median } from "./robust-fit.ts";
import {
  type AgentActivity,
  type AgentUsage,
  addTokens,
  hourMs,
  noTokens,
  type TokenCounts,
  tokensOf,
  totalTokens,
} from "./types.ts";

/** Everything the forecast needs to know about one agent's demand. */
export interface DemandProfile {
  readonly agentId: string;
  readonly model: string;
  /** Each token type's share of its tokens, to turn tokens into points. */
  readonly mix: TokenCounts;
  /** True when it has no running or queued run and no open task. */
  readonly idle: boolean;
  /** Tokens per hour now: the recent rate, or the idle rate when idle. */
  readonly currentRate: number;
  /** Tokens per hour for each hour of the week (0 is Sunday 00:00 UTC). */
  readonly weekProfile: readonly number[];
  /** P90 over P50 of an hour's tokens: how far a busy hour goes above a typical one. */
  readonly spread: number;
}

/** Tokens in one hour, typical (P50) and busy (P90). */
export interface HourDemand {
  readonly p50: number;
  readonly p90: number;
}

export const profileDays = 14;
export const recentHours = 2;
/** After this many hours, a third of the current level is left in the blend. */
export const settleHours = 3;
/** The idle rate is this low quantile of its hours: monitor wakes and little else. */
export const idleQuantile = 0.1;
const hoursInWeek = 168;
/** A spread with too little history to measure. */
const defaultSpread = 2;
const largestSpread = 4;
/** How many samples' weight the hour-of-day mean gets against one hour-of-week slot. */
const profileShrink = 2;

/** The hour of the week an instant falls in, counting from Sunday 00:00 UTC. */
export function hourOfWeek(atMs: number): number {
  const date = new Date(atMs);
  return date.getUTCDay() * 24 + date.getUTCHours();
}

export function quantile(values: readonly number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return 0;
  }
  const position = (sorted.length - 1) * share;
  const below = sorted[Math.floor(position)] ?? 0;
  const above = sorted[Math.ceil(position)] ?? below;
  return below + (above - below) * (position - Math.floor(position));
}

/** The agent's tokens in each whole hour of the last 14 days, oldest first. */
function hourlyTotals(usage: readonly AgentUsage[], nowMs: number): number[] {
  const endMs = Math.floor(nowMs / hourMs) * hourMs;
  const startMs = endMs - profileDays * 24 * hourMs;
  const totals = new Array<number>(profileDays * 24).fill(0);
  for (const row of usage) {
    const index = Math.floor((Date.parse(row.bucketStart) - startMs) / hourMs);
    if (index >= 0 && index < totals.length) {
      totals[index] = (totals[index] ?? 0) + totalTokens(tokensOf(row));
    }
  }
  return totals;
}

/** Mean tokens per slot, where `slotOf` names each hour's slot. */
function slotMeans(
  totals: readonly number[],
  slots: number,
  slotOf: (index: number) => number,
): number[] {
  const sums = new Array<number>(slots).fill(0);
  const counts = new Array<number>(slots).fill(0);
  totals.forEach((value, index) => {
    const slot = slotOf(index);
    sums[slot] = (sums[slot] ?? 0) + value;
    counts[slot] = (counts[slot] ?? 0) + 1;
  });
  return sums.map((sum, slot) => sum / Math.max(counts[slot] ?? 0, 1));
}

/**
 * Tokens per hour for each hour of the week. 14 days give only two samples
 * of each hour of the week, so each is pulled towards the mean of that hour
 * of the day (14 samples): weekdays and weekends still differ, but one odd
 * day doesn't make a habit.
 */
function weekProfileOf(totals: readonly number[], firstHourMs: number): number[] {
  const weekSlot = (index: number) => hourOfWeek(firstHourMs + index * hourMs);
  const daySlot = (index: number) => weekSlot(index) % 24;
  const byWeekHour = slotMeans(totals, hoursInWeek, weekSlot);
  const byDayHour = slotMeans(totals, 24, daySlot);
  const samples = totals.length / hoursInWeek;
  return byWeekHour.map(
    (mean, slot) =>
      (samples * mean + profileShrink * (byDayHour[slot % 24] ?? 0)) / (samples + profileShrink),
  );
}

/** How far busy hours run above what the profile expects, from the history's own scatter. */
function spreadOf(
  totals: readonly number[],
  profile: readonly number[],
  firstHourMs: number,
): number {
  const ratios = totals.flatMap((value, index) => {
    const expected = profile[hourOfWeek(firstHourMs + index * hourMs)] ?? 0;
    return expected > 0 ? [value / expected] : [];
  });
  const typical = median(ratios);
  if (ratios.length === 0 || !(typical > 0)) {
    return defaultSpread;
  }
  return Math.min(Math.max(quantile(ratios, 0.9) / typical, 1), largestSpread);
}

function shares(tokens: TokenCounts): TokenCounts {
  const total = totalTokens(tokens);
  if (total === 0) {
    return { input: 0, cached: 0, output: 1 };
  }
  return {
    input: tokens.input / total,
    cached: tokens.cached / total,
    output: tokens.output / total,
  };
}

/** One agent's demand profile at `now`, from its own token history and what it is doing now. */
export function demandProfile(
  activity: AgentActivity,
  usage: readonly AgentUsage[],
  now: string,
): DemandProfile {
  const nowMs = Date.parse(now);
  const own = usage.filter(
    (row) => row.agentId === activity.agentId && Date.parse(row.bucketStart) < nowMs,
  );
  const totals = hourlyTotals(own, nowMs);
  const firstHourMs = Math.floor(nowMs / hourMs) * hourMs - totals.length * hourMs;
  const weekProfile = weekProfileOf(totals, firstHourMs);
  const recent = own
    .filter((row) => Date.parse(row.bucketStart) >= nowMs - recentHours * hourMs)
    .reduce((sum, row) => sum + totalTokens(tokensOf(row)), 0);
  const idle = activity.runningRuns + activity.queuedRuns + activity.openTasks === 0;
  return {
    agentId: activity.agentId,
    model: activity.model,
    mix: shares(own.reduce((sum, row) => addTokens(sum, tokensOf(row)), noTokens)),
    idle,
    currentRate: idle ? quantile(totals, idleQuantile) : recent / recentHours,
    weekProfile,
    spread: spreadOf(totals, weekProfile, firstHourMs),
  };
}

/** The agent's tokens in the hour starting at `hourStartMs`, seen from `nowMs`. */
export function demandAt(profile: DemandProfile, nowMs: number, hourStartMs: number): HourDemand {
  const hoursAhead = Math.max(0, (hourStartMs - nowMs) / hourMs);
  const stillNow = Math.exp(-hoursAhead / settleHours);
  const usual = profile.weekProfile[hourOfWeek(hourStartMs)] ?? 0;
  const p50 = stillNow * profile.currentRate + (1 - stillNow) * usual;
  return { p50, p90: p50 * profile.spread };
}
