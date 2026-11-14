# ports.agent-runs-not-available

- Status: active
- Since: 0.1.0
- Source: HAL-9359, from the decision on HAL-9358

The ports package shall give `RunExecutor` one error, `AgentRunsNotAvailable`, for a `startAgent` that the executor refuses on purpose because agent runs aren't built yet (engine step 4), and an `isAgentRunsNotAvailable(value)` check that tells it apart by its `name`, without `instanceof`, so it works when an executor has its own copy of the package. Any other failure of a start stays a plain error. It goes away when the agent loop lands.

Rationale: a caller that answers a person, such as the host's run routes, must tell "not built yet" from "the server broke", without reading the message.

## Examples

- Given `new AgentRunsNotAvailable("Not yet.")`, when it is checked with `isAgentRunsNotAvailable`, then it passes and keeps its message.
- Given an `Error` from another copy of the package, named `AgentRunsNotAvailable`, when it is checked, then it passes.
- Given a plain `Error` or `RangeError`, when it is checked, then it fails.
