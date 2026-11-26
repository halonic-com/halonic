# agent-host-client.sync-diagnostics

- Status: active
- Since: unreleased
- Source: HAL-19337 (PR 5 of the sync service design approved by the maintainer on HAL-19201); `agent-host.sync-diagnostics`

The sync diagnostics stand-in shall read the agent host's sync counts and timings with `GET /v1/sync/diagnostics` and pass them on when the answer has the diagnostics' shape. When the host refuses, answers another shape, or doesn't answer within 10 seconds, it shall fail instead of passing anything on.

## Examples

- Given the host answers its sync diagnostics, when Settings reads them,
  then it gets the counts and timings the host answered.
- Given the host answers diagnostics with a field they don't have, such as a title, when Settings reads them,
  then the read fails and nothing is shown.
- Given the host doesn't answer, when Settings reads the sync diagnostics,
  then the read fails after 10 seconds.
