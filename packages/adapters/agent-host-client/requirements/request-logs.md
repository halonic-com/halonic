# agent-host-client.request-logs

- Status: active
- Since: unreleased
- Source: HAL-19291 (I7 PR 3b, the Build chat's `read_request_log` in Studio); `agent-host.request-log-routes`

The request logs client shall read a local integration's request log by asking the host's `POST /v1/integration-logs/read` with the window's own workspace and the integration's id, and nothing else, and give the lines the host answered, leaving out any that isn't a request or a failure note. It shall throw when the host refuses.

## Examples

- Given a host that answers a request line and a line of another type, when Studio reads the log of `notes`, then it gets the request line only.
- Given a host that answers 422 `request_log_unreadable`, when Studio reads the log, then the read fails.
