# engine.budget-tokens

- Status: active
- Since: unreleased
- Source: HAL-17255, token phase 1f (direction on HAL-16892, sections 3 and 4: track tokens next to `cost` in budgets, track only)

When the kernel works out what a run and the month have spent for the budget (`engine.budget-stops`), it shall also add up the tokens of the same runs from their summaries' `usage`: the run's tokens over its top-level run and every child run under it, and the month's over every run that started in the same calendar month (UTC), test runs left out. A call paid for by the person's subscription shall count in the tokens, though it has no `cost`. The tokens shall stop no run: the run and monthly budgets stay in the budget's currency.

## Examples

- Given a run on an API key that made two calls of 1000 input and 200 output tokens costing 0.25 EUR each,
  when its spend is worked out,
  then it spent 0.50 EUR, and 2000 input and 400 output tokens for the run and the month.
- Given a run and its child run, each with one call of 1000/200 tokens paid for by the person's subscription,
  when the child's spend is worked out,
  then it spent 0 EUR, and 2000/400 tokens for the run and the month.
- Given a subscription run and an API-key run this month, a run last month and a test run,
  when the month's tokens are worked out,
  then they are those of the subscription run and the API-key run together.
- Given a subscription run that used 51 calls' tokens and a run budget of 0.01 EUR,
  when the budget is checked,
  then nothing stops the run.
