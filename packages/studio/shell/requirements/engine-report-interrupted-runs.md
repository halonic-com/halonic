# shell.engine-report-interrupted-runs

- Status: active
- Since: unreleased
- Source: HAL-1845 (F15b)

When the engine process tells the shell it is ready and how many runs it ended as `interrupted` on the way, the shell shall send `engine.connection { state: "connected", interruptedRuns }` with that number. If the engine doesn't tell, then the shell shall send `connected` without `interruptedRuns`.

## Examples

- Given a supervised engine that was restarted after it stopped,
  when it reports ready with 2 interrupted runs,
  then listeners get `connected` with `interruptedRuns: 2`.
- Given an engine that reports ready without a count,
  when it answers,
  then listeners get `connected` with no `interruptedRuns` field.
