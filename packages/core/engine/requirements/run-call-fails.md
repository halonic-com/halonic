# engine.run-call-fails

- Status: active
- Since: 0.1.0
- Source: HAL-1527, step 3(b) of the HAL-186 plan; HAL-1728

When a call that a run waits on fails, the engine shall end the run with `run.failed` in the state that made the call, with the reason and host that `runFailureReasonOf` gives the error and the error's message. A failure of a call the run no longer waits on shall change nothing.

## Examples

- Given a run waiting on a model call,
  when the model is offline at host `models.acme.test` and no model is left,
  then the run fails with `reason: "model-unreachable"` and that host.
- Given a run that has already moved past `call-1`,
  when a failure of `call-1` arrives,
  then the log doesn't change.
