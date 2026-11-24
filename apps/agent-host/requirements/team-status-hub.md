# agent-host.team-status-hub

- Status: active
- Since: unreleased
- Source: phase 2 card approved by the board on HAL-17544 (24 Nov); architecture note on HAL-17511, sections 1.3 and 1.5 (freshness, load and the offline cache); task HAL-17633

The agent host shall serve one `TeamStatus` that joins every provider's sources. It shall read spend, seats, pull requests and the merge queue on a 5-minute tick through the `Scheduler` port, and when a read finds its answer older than 5 minutes it shall fetch it again, at most once a minute per read and provider, with every read meanwhile sharing the one fetch. It shall keep the port's fields of each answer in the app data cache under the rules of `agent-host.agent-messaging-cache`, and never a key, a cookie or session, an `Authorization` header, or a whole request or response. While a provider fails, the agent host shall report the failure and answer with that provider's last answer, which carries its source's own `asOf`, and fail the read only when no provider has an answer.

## Examples

- Given a seats read answered a moment ago,
  when a screen reads seats ten times within a minute,
  then the provider is asked once.
- Given a seats answer 5 minutes old,
  when a screen reads seats,
  then the provider is asked again.
- Given a provider that stopped answering,
  when a screen reads seats every 10 seconds,
  then the provider is asked at most once a minute.
- Given seats read live at 14:02 and an engine restarted while the line is cut,
  when a screen reads seats,
  then it gets the seats as of 14:02.
- Given a provider that hangs its request, with its key in an `Authorization` header, on every answer,
  when the agent host caches the answers,
  then no cache file holds the key, the header or the request.
