# engine.budget-token-stops

- Status: active
- Since: unreleased
- Source: task HAL-17286, a follow-up to HAL-17251; the run's tokens from `engine.budget-tokens` (HAL-17255); which tokens count decided on HAL-17286

When the workspace's budget sets `perRunTokens`, the kernel shall count the run's tokens wherever `engine.budget-stops` works out the run spend, over the same runs: the `usage` of its top-level run and of every child run under it, sub-agents included. All tokens count, cache reads and writes included: input, output, cache read, cache write and 1-hour cache write tokens. Calls paid for by the person's subscription count too, since their tokens are in a summary's `usage`. When the run's tokens are at or over `perRunTokens`, the kernel shall stop the run as `engine.budget-stops` does, both before a step's model call or harness run and before each model call a harness bridge passes on, with the error `Run token limit reached: <used> of <limit> tokens used.` (whole numbers with a comma every three digits) and the cause `{ kind: "limit_reached", code: "budget.run-tokens", detail: { limit, spent } }`, the numbers as strings and no currency. The run budget is checked first, then the run token limit, then the monthly budget.

## Examples

- Given a run token limit of 1,000 and a run whose only call used 100 input, 20 output and 900 cache read tokens,
  when the run's tokens are counted,
  then they are 1,020 and the run stops with the cause code `budget.run-tokens` and the detail `{ limit: "1000", spent: "1020" }`.
- Given a run token limit of 1,000 and a run whose first call used 15 tokens and a second, free call 1,200,
  when it reaches its next task state,
  then it fails there with the reason `budget` and the error `Run token limit reached: 1,215 of 1,000 tokens used.`
