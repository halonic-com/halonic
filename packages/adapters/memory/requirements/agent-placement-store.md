# memory.agent-placement-store

- Status: active
- Since: 0.1.0
- Source: stack 3a of the [HAL-189 implementation plan](/HAL/issues/HAL-189#document-implementation-plan); `AgentPlacementStore` port v1

The memory agent placement store shall keep each placement as JSON text, so that every read gives a fresh copy. For tests, `damage(key)` shall make that agent's placement unreadable, after which `get` throws an error naming the agent and its location. `damage` on an agent without a placement shall throw and create nothing.

## Examples

- Given a saved placement for `coder` in `/workspaces/acme`,
  when it is damaged and read,
  then it throws an error naming `coder` and `/workspaces/acme`.
- Given an empty memory placement store,
  when `coder` in `/workspaces/acme` is damaged,
  then it throws naming them, and reading `coder` still gives `null`.
