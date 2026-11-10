# ports.run-cancel

- Status: active
- Since: 0.1.0
- Source: HAL-3963 (the maintainer's decision on HAL-3961, the review of #1209: an optional cancel keeps the port at version 1)

The `RunExecutor` port shall have an optional `cancel` method that takes a run id and gives the run's summary after the cancel, so the port stays at version 1 and an executor without it still satisfies the port. What the local executor does with it is in `engine.local-run-cancel`.

## Examples

- Given an executor written before `cancel`, with `start`, `startAgent`, `send`, `subscribe` and `chatTurn` only,
  when it is used as a `RunExecutor`,
  then it type-checks.
- Given a `RunExecutor` that has `cancel`,
  when it is called with "run_1",
  then it gives a `Promise<RunSummary>`.
