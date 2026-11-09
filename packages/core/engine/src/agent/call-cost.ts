// What one model call cost, for the `cost` of its `llm.response`. A call
// without a cost counts as unpriced in the run's summary.

import type { Usage } from "@halonicjs/events";
import type { ResolvedModel } from "./model-chain.ts";

/**
 * The cost of one call to `model`, in the workspace's budget currency and
 * not rounded: its tokens at the model's price per million, 0 for a local
 * model without a price, and `undefined` when the cost is unknown.
 *
 * @example
 * callCost({ ...model, price: { input: 2, output: 8 } }, { inputTokens: 1000, outputTokens: 500 }); // 0.006
 */
export function callCost(model: ResolvedModel, usage: Usage): number | undefined {
  if (model.price !== undefined) {
    return (
      (usage.inputTokens / 1e6) * model.price.input +
      (usage.outputTokens / 1e6) * model.price.output
    );
  }
  return model.local === true ? 0 : undefined;
}
