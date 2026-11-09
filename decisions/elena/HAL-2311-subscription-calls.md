# Decision: subscription calls are marked `paidBy: "subscription"` and counted in `subscriptionCalls`

- Requirements: `events.summary-cost`, `events.run-log-contract`, `ports.harness-bridge-server`,
  `engine.turn-prices-calls`
- Task: HAL-2311, decided by the maintainer on HAL-2303 (question 3)
- Approval: the maintainer owns `core/events` and `core/ports` and approves this change in review

## What changes

The three requirements grow; nothing they promised before is taken away.

- `llm.response` gets an optional `paidBy: "subscription"`. The bridge sets it, next to `cost: 0`,
  for a provider reached with `kind: "sign-in"`. The new `bridgeCallCharge` in the ports package
  gives both fields, so an adapter can't record one without the other.
- `RunSummary` gets `subscriptionCalls`. A call marked `paidBy: "subscription"` adds its tokens to
  `usage`, and counts there instead of in `cost` or `unpricedCalls`.
- One example each in the three requirements above it, and `events.run-log-contract` names
  `paidBy` with the other optional fields that came after the reference run log. No test was
  weakened; the contract's type test and the summaries that list every field now also list
  `paidBy` and `subscriptionCalls: 0`.

## Why

The board allowed subscription sign-in with "tokens counted but not priced" (HAL-2257, Q1). Until
now the bridge recorded such a call with `cost: 0` and nothing else, so Studio couldn't tell it from
a free local model, and its texts must never show it as €0.00, "No price" or **Add a price**.

The name is `paidBy`, not a boolean such as `subscription: true`, so another payer can join later
without a second field. Its only value is `"subscription"`; Halonic's own calls leave it out.

The call keeps `cost: 0`. A reader that predates the marker still sees a call that cost Halonic
nothing, not an unpriced one, and `cost` stays a sum Halonic actually spends, which is what a budget
compares against. The summary ignores `cost` on a marked call either way, so a subscription call
never counts towards a budget even if a future writer prices it.
