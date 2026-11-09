// A model's price and what a call costs at it. The engine and the bridge
// both price calls with `priceOf`, so a call costs the same on either path.

import type { Usage } from "@halonicjs/events";

/** A model's price per million tokens, in the workspace's budget currency, as `models.yaml` gives it. */
export interface ModelPrice {
  readonly input: number;
  readonly output: number;
}

/**
 * What a call with `usage` costs at `price`, in the workspace's budget
 * currency and not rounded: its input tokens times the input price plus its
 * output tokens times the output price, divided by a million once
 * (requirement `ports.model-price`).
 *
 * @example
 * priceOf({ input: 3, output: 15 }, { inputTokens: 1000, outputTokens: 200 }); // 0.006
 */
export function priceOf(price: ModelPrice, usage: Usage): number {
  const tokensPerPrice = 1_000_000;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / tokensPerPrice;
}
