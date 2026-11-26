/**
 * The front bot's two automatic stops (HAL-18847 section 4.3): the $3 daily
 * cap, counted from the API's own token counts, and the stop for 15 minutes
 * when more than 1 in 5 calls fail. Pure: the plugin keeps the running state
 * and asks here what a call cost and whether to stop.
 */

/** The board's daily cap (HAL-18847, question 2): calls stop once a UTC day passes $3. */
export const dailyCapMicroUsd = 3_000_000;

/** At 80% of the cap Chief is told once that day. */
export const warnAtMicroUsd = 2_400_000;

/**
 * Haiku 4.5's list prices ($1 and $5 per million input and output tokens), in
 * micro-dollars per million tokens, so whole token counts multiply without rounding.
 */
const inputMicroUsdPerMillionTokens = 1_000_000;
const outputMicroUsdPerMillionTokens = 5_000_000;

/** The token counts of one Messages API answer. */
export interface CallUsage {
  readonly input_tokens?: unknown;
  readonly output_tokens?: unknown;
}

/** A token count, or 0 when the answer's number is missing or odd. */
export function tokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** What one call cost, in micro-dollars, from the answer's token counts. */
export function callCostMicroUsd(usage: CallUsage | undefined): number {
  const perMillion =
    tokenCount(usage?.input_tokens) * inputMicroUsdPerMillionTokens +
    tokenCount(usage?.output_tokens) * outputMicroUsdPerMillionTokens;
  return perMillion / 1_000_000;
}

/** A day's running total, as the plugin keeps it. */
export interface DaySpend {
  /** The UTC day, such as `2026-11-26`. */
  readonly day: string;
  readonly microUsd: number;
  /** Whether Chief was already told about 80% this day. */
  readonly warned: boolean;
}

/** The UTC day a call counts towards. */
export function spendDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The total for `day`: the stored one, or a fresh one when the day changed. */
export function spendFor(stored: DaySpend | null, day: string): DaySpend {
  return stored !== null && stored.day === day ? stored : { day, microUsd: 0, warned: false };
}

/** Whether the day's spend reached the cap, so the bot makes no more calls today. */
export function capReached(spend: DaySpend): boolean {
  return spend.microUsd >= dailyCapMicroUsd;
}

/** Whether this spend crosses 80% for the first time today, so Chief is told once. */
export function shouldWarn(spend: DaySpend): boolean {
  return !spend.warned && spend.microUsd >= warnAtMicroUsd;
}

/** The window the error rate is counted over, and how long the stop lasts. */
export const errorWindowMs = 15 * 60_000;

/** More than this share of failed calls in the window stops the bot. */
export const maxErrorShare = 0.2;

/** Fewer calls than this in the window never stop the bot: one early failure isn't a rate. */
export const minCallsForRate = 5;

/** Recent calls, each with when it ended and whether it failed, plus a running stop. */
export interface CallHealth {
  readonly calls: readonly { readonly at: number; readonly failed: boolean }[];
  /** Until when the bot is stopped, in epoch milliseconds; 0 when it isn't. */
  readonly stoppedUntil: number;
}

/** No calls and no stop. */
export const freshHealth: CallHealth = { calls: [], stoppedUntil: 0 };

/** Whether the bot is stopped for errors at `now`. */
export function stoppedForErrors(health: CallHealth, now: Date): boolean {
  return now.getTime() < health.stoppedUntil;
}

/**
 * The health after one more call: calls older than the window drop out, and
 * when more than 1 in 5 of at least 5 calls failed, the bot stops for 15
 * minutes and the window starts empty again.
 */
export function afterCall(health: CallHealth, now: Date, failed: boolean): CallHealth {
  const since = now.getTime() - errorWindowMs;
  const calls = [...health.calls.filter((call) => call.at > since), { at: now.getTime(), failed }];
  const failures = calls.filter((call) => call.failed).length;
  if (calls.length >= minCallsForRate && failures / calls.length > maxErrorShare) {
    return { calls: [], stoppedUntil: now.getTime() + errorWindowMs };
  }
  return { calls, stoppedUntil: health.stoppedUntil };
}
