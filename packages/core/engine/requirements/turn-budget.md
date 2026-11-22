# engine.turn-budget

- Status: active
- Since: unreleased
- Source: HAL-16338

While a run's agent turn runs in the engine's own loop, the engine shall keep to the workspace's run and monthly budget (`engine.budget-stops`) before each model call after the turn's first, and before a subagent's turn starts: once the budget is reached, it shall make no more model calls in that turn or under it, and the run shall fail with the reason `budget` and the stop's cause, as when its step stops it. The turn's first model call is kept to by the step that asked for it.

## Examples

- Given a run budget of 0.50 EUR and a writer whose turn calls a tool twice and then answers, each model call costing 0.30 EUR,
  when the run's draft step runs,
  then the model is asked twice, and the run fails at `draft` with the reason `budget` and the cause code `budget.run`.
- Given a run budget of 0.25 EUR and a writer whose first call, costing 0.30 EUR, delegates to `checker`,
  when the run's draft step runs,
  then the checker's model is never asked, and the run fails with the reason `budget`.
