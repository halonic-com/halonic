# engine.run-state-fold

- Status: active
- Since: 0.1.0
- Source: HAL-1526, step 3(a) of the HAL-186 plan

The engine shall fold a run's events, oldest first, into a `RunState` with `evolve`, starting from nothing or from a stored snapshot, and folding the same events shall always give the same state, whether from nothing or from a snapshot of an earlier part of the log. When a run log does not start with `run.started`, or has a second `run.started`, the engine shall refuse to fold it.

## Examples

- Given the events of a run that entered `draft` and whose agent answered,
  when they are folded,
  then the state is `running` in `draft`, with the context the agent wrote, no pending call and the last event's `seq`.
- Given the same log,
  when the first three events are folded, stored as a snapshot, and the rest folded onto it,
  then the state equals the one folded from nothing.
- Given a log that starts with `state.entered`,
  when it is folded,
  then the engine refuses with an error that names the first event.
