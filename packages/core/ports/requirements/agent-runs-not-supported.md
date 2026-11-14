# ports.agent-runs-not-supported

- Status: active
- Since: 0.1.0
- Source: HAL-9356, left open in HAL-9224

The ports package shall give `RunExecutor` one error, `AgentRunsNotSupported`, for a `startAgent` on an executor that can't start agent runs at all, and an `isAgentRunsNotSupported(value)` check that tells it apart by its `name`, without `instanceof`, so it works when an executor has its own copy of the package. Any other failure of a start stays a plain error.

Rationale: a caller that answers a person, such as the host's run routes, must tell "this server can't do that" from a real failure, so the person isn't told the server broke.

## Examples

- Given `new AgentRunsNotSupported("No agent loop yet.")`,
  when it is checked with `isAgentRunsNotSupported`,
  then it passes and keeps its message.
- Given an `Error` named `AgentRunsNotSupported` from another copy of the package,
  when it is checked,
  then it passes.
- Given a plain `Error`, or `RunTargetNotFound`,
  when it is checked,
  then it fails.
