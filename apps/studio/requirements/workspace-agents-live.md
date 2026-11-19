# studio.workspace-agents-live

- Status: draft
- Since: unreleased
- Source: HAL-13178 (T6, the "Changes not live yet" line); flow-agents 3.1; core's `app.live-state` (HAL-3246); the routines host's `liveness` part

The desktop app's agents host shall answer an agent's live state with what its `liveness` part says for the agent's file path, and `live` when it has no such part, as the routines host does; for an agent the hub doesn't have it shall reject with `not_found`.

## Examples

- Given a `liveness` part that answers `not-live`, then the live state of `writer` is `not-live`, asked for `hubs/acme/agents/writer.agent.yaml`.
- Given no `liveness` part, then the live state of `writer` is `live`.
- Given an agent the hub doesn't have, then the live state rejects with `not_found`.
