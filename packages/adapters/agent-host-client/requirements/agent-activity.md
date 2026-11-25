# agent-host-client.agent-activity

- Status: active
- Since: unreleased
- Source: HAL-18567 (the Messenger's activity panel, design approved by the board on HAL-18558); `agent-host.team-activity-routes`

The agent activity stand-in shall read one workspace's runs with `POST /v1/messaging/runs`, sending the workspace's path with the query's `agent` and `since` only when the query gives them, and its pull requests with `POST /v1/messaging/pull-requests`, and pass on the items the host answers. When the host refuses, it shall fail with the host's kind and status.

## Examples

- Given a host that answers Ada's runs for `/work/acme`,
  when Studio reads Ada's runs since midnight,
  then the host is asked with `{ workspace: "/work/acme", agent, since }` and Studio gets Ada's runs.
- Given a host that answers 502 `messaging_failed`,
  when Studio reads the pull requests,
  then the read fails with that kind.
