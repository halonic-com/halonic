// What one model call counts for (requirement `events.summary-cost`). A run's
// summary adds these up, and the engine's meter counts each call with the same
// rule, so a budget, a usage limit and a screen never disagree about a call.

import type { Usage } from "./run-basics.ts";

/** The fields of an `llm.response` that say what the call counts for. */
export interface ChargedCall {
  readonly usage: Usage;
  readonly cost?: number;
  readonly paidBy?: "subscription";
  readonly cached?: boolean;
}

/**
 * What one model call counts for:
 * - `priced`: its tokens, and its `cost`;
 * - `unpriced`: its tokens; the model has no price, so it costs 0 here;
 * - `subscription`: its tokens; the person's subscription paid, so it costs 0 whatever its `cost`;
 * - `cached`: nothing; the cache answered and no model was called.
 */
export type ModelCallCharge =
  | { readonly counted: "priced"; readonly usage: Usage; readonly cost: number }
  | { readonly counted: "unpriced" | "subscription"; readonly usage: Usage; readonly cost: 0 }
  | { readonly counted: "cached"; readonly usage: null; readonly cost: 0 };

/** What one model call counts for, by the rule a run's summary adds calls up with. */
export function modelCallCharge(call: ChargedCall): ModelCallCharge {
  if (call.cached === true) {
    return { counted: "cached", usage: null, cost: 0 };
  }
  if (call.paidBy === "subscription") {
    return { counted: "subscription", usage: call.usage, cost: 0 };
  }
  if (call.cost === undefined) {
    return { counted: "unpriced", usage: call.usage, cost: 0 };
  }
  return { counted: "priced", usage: call.usage, cost: call.cost };
}
