# engine.skip-lost-run-sweep

- Status: active
- Since: unreleased
- Source: HAL-16197 (S0 b0 of HAL-13210, option 1 of its risk comment)

Where the host turns the runs' `sweepsLostRuns` option off, the engine shall not end the runs it lost when it last stopped (`engine.end-interrupted-runs`, `engine.end-orphaned-child-runs`) and shall not mark their connector calls cut short: a run whose status is `running` or `waiting` shall stay as it is when the engine gets ready or starts a run, and getting ready shall tell 0. Where the option is left out or `true`, the engine shall end them as before.

The sweep takes every `running` run in the store for one the engine lost, so it is right only for the one engine on a store, as with `halonic serve`. On the Worker each isolate, and each run object's alarm, builds its own engine on the same run list, so a sweep there would end the other engines' live runs; the watchdog finds stuck runs instead.

## Examples

- Given a run that is `running` in the store, and an engine with `sweepsLostRuns: false`,
  when the engine starts another run,
  then the first run is still `running`, and its log is unchanged.
- Given a run that is `running` in the store, and an engine with `sweepsLostRuns: false`,
  when the engine gets ready,
  then it tells 0, and the run is still `running`.
- Given a run that is `running` in the store, and an engine that leaves `sweepsLostRuns` out,
  when the engine starts another run,
  then the first run has ended with `reason: "interrupted"`.
