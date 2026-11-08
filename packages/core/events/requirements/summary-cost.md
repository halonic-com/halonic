# events.summary-cost

- Status: active
- Since: 0.1.0
- Source: old app `summarize` at commit 784f78d; old test `budget.test.ts` checks `unpricedCalls`

When a run's model responses are summarized, the events package shall add up their input and output tokens and the cost of the priced ones, and count the responses without a cost as unpriced calls.

## Examples

- Given two `llm.response` events with 10/5 and 20/7 tokens and costs 0.25 and 0.5,
  when they are summarized,
  then the usage is 30 input and 12 output tokens, the cost is 0.75 and there are no unpriced calls.
- Given an `llm.response` without a cost and one with cost 0,
  when they are summarized,
  then the cost is 0 and there is 1 unpriced call.
