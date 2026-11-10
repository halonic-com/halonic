# engine.decide-refusals

- Status: active
- Since: 0.1.0
- Source: HAL-1526, step 3(a) of the HAL-186 plan

The engine shall decide what a run does next without reading a clock or making ids: the same run state, input and definitions shall always give the same events and effects. The engine shall refuse, before anything is recorded, a `start` for a run that has started, any other input for a run that hasn't, any input for a run that has ended, and an input the run's state doesn't accept.

## Examples

- Given a completed run, or one that ended at a step it couldn't try (`run.cant-try`),
  when an `effect-done` input arrives,
  then the engine refuses it with `engine.run-ended`.
- Given a run in a task state,
  when a `send` input arrives,
  then the engine refuses it with `engine.input-not-accepted`.
