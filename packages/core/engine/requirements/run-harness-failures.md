# engine.run-harness-failures

- Status: active
- Since: 0.1.0
- Source: HAL-189, stack 4b of its implementation plan; HAL-1668 (failure path); `sandbox-not-ready` from HAL-1709 (HAL-1782 P9); the sandbox and harness causes from HAL-10967

When the sandbox check for the agent's placement fails, the engine shall start nothing, not even the bridge, and fail the step with `sandbox-not-ready` and the check's reason code, never its own sentence. When a harness run's sandbox doesn't open, the engine shall fail the step with `sandbox-start-failed`, and when asking the sandbox's check again then says it can't start, with the check's reason code as `sandboxReason`. When the host offers no harness with the agent's harness id, or the harness's stream fails before its first event, the engine shall fail the step with `harness-start-failed`, and when the harness's `detect()` then says its program is missing or signed out for the agent's settings folder, with `harnessCause` `not-installed` or `signed-out`; when it says anything else, or throws, with no cause. A failure after the first event shall fail the step with the harness's own error. Until runs can wait on a harness, an `approval.requested` from the harness shall fail the step without recording it. A stream that ends without the agent's own `agent.finished` shall fail the step. In each case, everything the call started shall be stopped.

## Examples

- Given a sandbox whose check fails with `user-namespaces-restricted`,
  when the harness run starts,
  then the run fails with `sandbox-not-ready`, its `run.failed` has `sandboxReason: "user-namespaces-restricted"` and not the check's sentence, and nothing was started.

- Given a sandbox whose `open` throws,
  when the harness run starts,
  then the step fails with `sandbox-start-failed`, the log ends at `sandbox.started`, and the bridge is closed.
- Given a harness whose program isn't found, so its stream fails at once,
  then the step fails with `harness-start-failed`, and the harness run, the session and the bridge are stopped.

- Given a sandbox that passed its check but whose `open` throws, and whose check now fails with `user-namespaces-restricted`,
  when the harness run starts,
  then the run fails with `sandbox-start-failed` and `sandboxReason: "user-namespaces-restricted"`.
- Given a sandbox that passed its check and whose `open` throws, and whose check still passes,
  when the harness run starts,
  then the run fails with `sandbox-start-failed` and no `sandboxReason`.
- Given a harness whose program fails before its first event, and whose `detect()` says `missing` or `signed-out`,
  then the run fails with `harness-start-failed` and `harnessCause` `not-installed` or `signed-out`.
- Given a harness whose program fails before its first event, and whose `detect()` says `failed` or throws,
  then the run fails with `harness-start-failed` and no `harnessCause`.
