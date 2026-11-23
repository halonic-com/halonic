/**
 * The tagger's monthly spend guard (HAL-16901, requirement
 * `paperclip.difficulty-tagger-spend`). Pure: the plugin keeps the running
 * total in its state and asks here what a call cost and whether to stop.
 */

/** The board's limit: tagging stops once a calendar month (UTC) passes $5. */
export const monthlyLimitMicroUsd = 5_000_000;

/**
 * The price the guard counts with, in micro-dollars per million tokens:
 * Haiku 5.5's list prices ($0.10 and $0.50 per million input and output
 * tokens). Per million, so whole token counts multiply without rounding.
 */
const inputMicroUsdPerMillionTokens = 100_000;
const outputMicroUsdPerMillionTokens = 500_000;

/** The token counts of one Messages API answer. */
export interface TaggerUsage {
  readonly input_tokens?: unknown;
  readonly output_tokens?: unknown;
}

function tokens(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** What one call cost, in micro-dollars, from the answer's token counts. */
export function callCostMicroUsd(usage: TaggerUsage | undefined): number {
  const perMillion =
    tokens(usage?.input_tokens) * inputMicroUsdPerMillionTokens +
    tokens(usage?.output_tokens) * outputMicroUsdPerMillionTokens;
  return perMillion / 1_000_000;
}

/** The month a call counts towards, such as `2026-11`, in UTC. */
export function spendMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

/** A month's running total, as the plugin keeps it. */
export interface MonthSpend {
  readonly month: string;
  readonly microUsd: number;
  /** Whether the stop was already reported this month, so it's reported once. */
  readonly stopReported: boolean;
}

/** The total for `month`: the stored one, or a fresh one when the month changed. */
export function spendFor(stored: MonthSpend | null, month: string): MonthSpend {
  return stored !== null && stored.month === month
    ? stored
    : { month, microUsd: 0, stopReported: false };
}

/** Whether the month's spend has reached the limit, so the tagger makes no more calls. */
export function overLimit(spend: MonthSpend): boolean {
  return spend.microUsd >= monthlyLimitMicroUsd;
}
