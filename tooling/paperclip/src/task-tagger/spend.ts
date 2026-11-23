/**
 * The tagger's monthly spend guard (HAL-16928, requirement
 * `paperclip.task-tagger-spend`): it adds up what each Haiku call cost from
 * the tokens the API reports and stops tagging for the rest of the month at
 * the board's limit.
 */

/** The board's limit per company and calendar month (UTC), in US dollars. */
export const monthlyLimitUsd = 5;

/**
 * Claude Haiku 5.5's list prices in US dollars per token, for prompts up to
 * 100,000 tokens. The tagger's prompts stay far below that: the description
 * is cut at 4,000 characters.
 */
const inputUsdPerToken = 0.1 / 1_000_000;
const outputUsdPerToken = 0.5 / 1_000_000;

/** The `usage` part of a Messages API answer; a missing count is taken as 0. */
export interface Usage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
}

/** What one call cost, in US dollars. */
export function costUsd(usage: Usage | undefined): number {
  const count = (value: number | undefined) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
  return (
    count(usage?.input_tokens) * inputUsdPerToken + count(usage?.output_tokens) * outputUsdPerToken
  );
}

/** A company's spend in one month, as the plugin keeps it. */
export interface MonthSpend {
  /** `YYYY-MM`, UTC. */
  readonly month: string;
  readonly usd: number;
  readonly calls: number;
  /** The stop was already logged this month, so it is logged once. */
  readonly stopReported: boolean;
}

/** The month a time falls in, as `YYYY-MM` in UTC. */
export function monthOf(now: Date): string {
  return now.toISOString().slice(0, 7);
}

/** The spend to use now: the stored one while it is this month's, otherwise a fresh month. */
export function currentSpend(stored: MonthSpend | null | undefined, now: Date): MonthSpend {
  const month = monthOf(now);
  return stored?.month === month ? stored : { month, usd: 0, calls: 0, stopReported: false };
}

/** Whether the month's spend has reached the limit. */
export function limitReached(spend: MonthSpend): boolean {
  return spend.usd >= monthlyLimitUsd;
}

/** The spend after one more call. */
export function withCall(spend: MonthSpend, usd: number): MonthSpend {
  return { ...spend, usd: spend.usd + usd, calls: spend.calls + 1 };
}

/** A spend as the plugin page shows it, for example "$0.42 of $5 in 2026-11 (3,000 calls)". */
export function describeSpend(spend: MonthSpend): string {
  const calls = spend.calls.toLocaleString("en-US");
  return `$${spend.usd.toFixed(2)} of $${monthlyLimitUsd} in ${spend.month} (${calls} calls)`;
}
