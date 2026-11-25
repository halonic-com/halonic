# agent-host.team-activity-routes

- Status: active
- Since: unreleased
- Source: HAL-18567 (the Messenger's activity panel, design approved by the board on HAL-18558, data check HAL-18560); Liam's plan review on HAL-18567 (runs in the team hub, in memory only, with their own 10-second gap); `paperclip-client.team-runs`, `agent-host.team-status-hub`, `agent-host.paperclip-key`

The agent host shall serve one workspace's runs with `POST /v1/messaging/runs` and its pull requests with `POST /v1/messaging/pull-requests`, read through each connected connection's team status, which sends with the same key guard as its messaging provider, and joined by the team hub. A runs read shall take an optional agent ID and an optional `since` time with its zone, and the host shall refuse any other field or a `since` that isn't such a time. The host shall keep runs answers in memory only, never in a file, fetch one runs query at most once every 10 seconds per provider with every read meanwhile sharing the one fetch, and answer with a provider's last runs answer, marked `fromCache`, while that provider fails. When every provider fails a read, the host shall answer 502 `messaging_failed` with no detail and log the failure. Disconnect shall delete the pull requests the host kept for that connection.

## Examples

- Given a connected Paperclip where Ada is running a task,
  when Studio reads Ada's runs since midnight,
  then it gets Ada's live run and her earlier runs from today, and no log, output or error text.
- Given a runs read answered 5 seconds ago,
  when Studio reads the same runs again,
  then Paperclip isn't asked, and after 10 seconds it is.
- Given a runs read and a pull requests read,
  when the profile folder's files are listed,
  then none holds a run.
- Given a body whose `since` is "yesterday",
  when Studio reads the runs,
  then the host answers 400 and asks nobody.
- Given a Paperclip that can't be reached and no earlier answer,
  when Studio reads the runs,
  then the host answers 502 `messaging_failed` and its log names the failure.
- Given pull requests kept for a connection,
  when the person disconnects it,
  then the host's files hold none of its team answers.
