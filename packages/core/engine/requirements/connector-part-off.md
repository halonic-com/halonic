# engine.connector-part-off

- Status: active
- Since: unreleased
- Source: HAL-12343 (from Nina's C54 check on HAL-12637: a run whose plugin had a local tool that couldn't start ended without a word about it)

When a model turn of a run lists a connector's tools, whether the listing succeeds or fails, the engine shall read the parts the connector found off (`ports.connector-parts-off`) and write a `connector.part-off` event (`events.connector-part-off`) for each, with the agent, the connector's id, the part cut to `maxCauseNameLength`, and the reason code, before any `connector.listing-failed` of that turn (`engine.connector-listing-failed`), and go on with the turn. A connector that gives no parts off, or doesn't have the method, shall add nothing. A turn with no run log, such as a chat turn, shall write nothing.

## Examples

- Given a run whose writer lists the `weather` plugin, whose local tool `lister` can't start because the sandbox can't start here while its backend's `forecast` tool lists,
  when the writer's turn starts,
  then the log has `connector.part-off` with agent `writer`, connector `weather`, part `local:lister` and reason `sandbox-unavailable`, no `connector.listing-failed`, and the run completes.
- Given a plugin's connector none of whose parts start,
  when the turn starts,
  then the log has a `connector.part-off` for each part, then one `connector.listing-failed`.
- Given a connector that gives no parts off,
  when the turn starts,
  then the log has no `connector.part-off`.
