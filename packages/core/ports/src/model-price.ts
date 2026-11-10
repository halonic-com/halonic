// A model's price and what a call costs at it. The engine and the bridge
// both price calls with `priceOf`, so a call costs the same on either path.

import type { Usage } from "@halonicjs/events";

/** A model's price per million tokens, in the workspace's budget currency, as `models.yaml` gives it. */
export interface ModelPrice {
  readonly input: number;
  readonly output: number;
  /**
   * Input tokens read from the prompt cache. Absent: they cost `input`, so a
   * call is never left unpriced because its model has no cache price.
   */
  readonly cacheRead?: number;
  /**
   * Input tokens written to the prompt cache for its short lifetime
   * (Anthropic: 5 minutes). Absent: they cost `input`.
   */
  readonly cacheWrite?: number;
  /**
   * Input tokens written to the prompt cache for 1 hour. Absent: they cost
   * `cacheWrite`, or `input` when that is absent too. Both are cheaper than
   * a 1-hour write, so a model with 1-hour writes should give this price.
   */
  readonly cacheWrite1h?: number;
}

/**
 * What a call with `usage` costs at `price`, in the workspace's budget
 * currency and not rounded: each kind of token times its own price, divided
 * by a million once (requirement `ports.model-price`). Cache tokens cost the
 * input price when the model has no cache price; 1-hour cache writes cost the
 * short write price first.
 *
 * @example
 * priceOf({ input: 3, output: 15 }, { inputTokens: 1000, outputTokens: 200 }); // 0.006
 * priceOf({ input: 3, output: 15, cacheRead: 0.3 }, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 10_000 }); // 0.003
 */
export function priceOf(price: ModelPrice, usage: Usage): number {
  const tokensPerPrice = 1_000_000;
  const cacheReadPrice = price.cacheRead ?? price.input;
  const cacheWritePrice = price.cacheWrite ?? price.input;
  const cacheWrite1hPrice = price.cacheWrite1h ?? cacheWritePrice;
  const total =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    (usage.cacheReadTokens ?? 0) * cacheReadPrice +
    (usage.cacheWriteTokens ?? 0) * cacheWritePrice +
    (usage.cacheWrite1hTokens ?? 0) * cacheWrite1hPrice;
  return total / tokensPerPrice;
}
