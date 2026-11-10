# events.summary-cost

- Status: active
- Since: 0.1.0
- Source: old app `summarize` at commit 784f78d; old test `budget.test.ts` checks `unpricedCalls`; subscription calls from HAL-2311 (decided on HAL-2303, question 3); cache tokens from HAL-2688

When a run's model responses are summarized, the events package shall add up their input and output tokens, their tokens read from and written to the prompt cache (each on its own, and only when a response has them), and the cost of the priced ones, and count the responses without a cost as unpriced calls. A response marked `paidBy: "subscription"` shall count as a subscription call: its tokens are added up, but it is never priced and never counted as unpriced, whatever its `cost`.

## Examples

- Given two `llm.response` events with 10/5 and 20/7 tokens and costs 0.25 and 0.5,
  when they are summarized,
  then the usage is 30 input and 12 output tokens, the cost is 0.75 and there are no unpriced calls.
- Given `llm.response` events with 10/5 tokens and 900 cache reads, 20/7 tokens and 300 cache writes, and 1/1 tokens and 100 cache reads,
  when they are summarized,
  then the usage is 31 input, 13 output, 1,000 cache read and 300 cache write tokens.
- Given an `llm.response` without a cost and one with cost 0,
  when they are summarized,
  then the cost is 0 and there is 1 unpriced call.
- Given two subscription calls (one with cost 0, one without a cost), a call with cost 0.006, one without a cost and one with cost 0, each with 1,000 input and 200 output tokens,
  when they are summarized,
  then the usage is 5,000 input and 1,000 output tokens, the cost is 0.006, there is 1 unpriced call and there are 2 subscription calls.
