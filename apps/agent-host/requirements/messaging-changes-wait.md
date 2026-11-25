# agent-host.messaging-changes-wait

- Status: active
- Since: unreleased
- Source: HAL-18773 (part B of the plan Liam approved on HAL-18736: Studio hears of a change at once instead of asking every 2 seconds)

When Studio asks `POST /v1/messaging/changes` with `"wait": true`, the agent host shall answer as soon as a source of that workspace has changed after `after`: at once when one already has, otherwise when the next change is recorded. When no source changes within 25 seconds, it shall answer with no sources and the same `next`. Each waiting request shall wait on its own: a request that is still waiting shall not delay the answer to another request, for the same workspace or another one. When the caller goes away or the host stops, the request shall stop waiting. Without `wait`, it shall answer at once, as before.

## Examples

- Given Studio waits for changes after 0 and nothing has changed,
  when `paperclip:halonic` changes,
  then the request answers with `paperclip:halonic` at once.
- Given Studio waits for changes and nothing changes,
  when 25 seconds pass,
  then the request answers with no sources.
- Given one request waits for changes in Acme's other workspace,
  when a source of Acme's workspace changes,
  then the request for Acme's workspace answers at once and the other one keeps waiting.
