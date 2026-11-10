# engine.harness-start-limits

- Status: active
- Since: 0.1.0
- Source: HAL-189, stack 4c of its implementation plan and Liam's review of it (HAL-3283); HAL-1668 (failure path, rule 1)

When a harness run's sandbox hasn't opened within its time limit, the engine shall fail the step with `sandbox-start-failed`, and shall close the sandbox's session if it opens later. When the harness hasn't sent its first event within its time limit, the engine shall fail the step with `harness-start-failed`, and shall stop the harness run, close the session and close the bridge. The limits shall default to 30 seconds for the sandbox and 60 seconds for the harness, the host may set others, and the engine shall refuse, when it is created, a limit that isn't a whole number of milliseconds of 1 or more, and `sandbox.started` and `harness.started` shall carry the limit in force. The engine shall wait for each limit through the `Scheduler` port, and a limit's timer that arrives after its start is done shall change nothing.

## Examples

- Given a sandbox that takes longer than 30 seconds to open,
  when the harness run starts,
  then the step fails with `sandbox-start-failed`, the log ends at `sandbox.started`, the bridge is closed, and the session is closed as soon as it opens.
- Given a harness program that hangs before its first event,
  when 60 seconds have passed since `harness.started`,
  then the step fails with `harness-start-failed`, and the harness run, the session and the bridge are stopped.
