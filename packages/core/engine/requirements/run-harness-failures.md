# engine.run-harness-failures

- Status: active
- Since: 0.1.0
- Source: HAL-189, stack 4b of its implementation plan; HAL-1668 (failure path); `sandbox-not-ready` from HAL-1709 (HAL-1782 P9)

When the sandbox check for the agent's placement fails, the engine shall start nothing, not even the bridge, and fail the step with `sandbox-not-ready` and the check's reason code, never its own sentence. When a harness run's sandbox doesn't open, the engine shall fail the step with `sandbox-start-failed`. When the host offers no harness with the agent's harness id, or the harness's stream fails before its first event, the engine shall fail the step with `harness-start-failed`. A failure after the first event shall fail the step with the harness's own error. Until runs can wait on a harness, an `approval.requested` from the harness shall fail the step without recording it. A stream that ends without the agent's own `agent.finished` shall fail the step. In each case, everything the call started shall be stopped.

## Examples

- Given a sandbox whose check fails with `user-namespaces-restricted`,
  when the harness run starts,
  then the run fails with `sandbox-not-ready`, its `run.failed` has `sandboxReason: "user-namespaces-restricted"` and not the check's sentence, and nothing was started.

- Given a sandbox whose `open` throws,
  when the harness run starts,
  then the step fails with `sandbox-start-failed`, the log ends at `sandbox.started`, and the bridge is closed.
- Given a harness whose program isn't found, so its stream fails at once,
  then the step fails with `harness-start-failed`, and the harness run, the session and the bridge are stopped.
