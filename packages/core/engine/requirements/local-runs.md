# engine.local-runs

- Status: active
- Since: 0.1.0
- Source: HAL-1527, step 3(b) of the HAL-186 plan

When the local executor starts a run or sends it an event, it shall record the input with one step, set a scheduler timer for each effect the step asked for, and return the run's summary without waiting for the effects. When such a timer is due, it shall carry out the effect and record its result as the run's next input, so a run moves on one step per timer. A timer that is late, repeated, or for a call the run no longer waits on shall change nothing. A start whose run id already exists shall return that run and record nothing, and a run id longer than 256 UTF-8 bytes shall be refused with a `RangeError` before anything is recorded. Before it starts or resumes any run, the executor shall end the runs it lost when it last stopped, once.

## Examples

- Given a workflow with a task state and a final state,
  when the run is started,
  then `start` returns a running summary with the model call's timer set, and once that timer is due the run completes with the model's answer in its context.
- Given that timer delivered twice,
  when both deliveries run,
  then the model is called once and the log has one `agent.finished`.
- Given a run id that already has a run,
  when a run is started with that id,
  then the existing run's summary comes back and its log doesn't change.
- Given a run left `running` by an engine that stopped,
  when a new executor on the same store starts its first run,
  then the lost run has ended with `reason: "interrupted"`.
