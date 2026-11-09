# engine.step-appends-once

- Status: active
- Since: 0.1.0
- Source: HAL-1527, step 3(b) of the HAL-186 plan

When the engine moves a run on by one input, it shall read the run, decide, and append the decided events only if the run's log has not moved on since the read. When another writer appended first, the engine shall read the run again and decide afresh, so an input is never written twice, and after 10 such reads it shall give up with an error and store nothing of its own. The engine shall carry out a decision's effects only after its events are stored.

## Examples

- Given a new run,
  when its start is stepped,
  then `run.started`, `state.entered` and `agent.started` are appended as events 1 to 3 with the start's time, and the model call is handed back as an effect.
- Given a run waiting on `call-1`,
  when the same answer is stepped twice at once,
  then one step appends it and the other reads the ended run and is refused with `engine.run-ended`, so the log has one `agent.finished`.
- Given a log that another writer keeps adding to,
  when an answer is stepped,
  then the step gives up after 10 tries and has appended nothing.
