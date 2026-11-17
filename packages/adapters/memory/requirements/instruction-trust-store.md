# memory.instruction-trust-store

- Status: active
- Since: unreleased
- Source: HAL-3106 slice 3b; `InstructionTrustStore` port v1

The memory instruction trust store shall keep each record as JSON text, so that every read gives a fresh copy. For tests, `damage(key)` shall make that agent's record unreadable, after which `get` throws an error naming the agent and its location. `damage` on an agent without a record shall throw and create nothing. A record that isn't exactly trusted instructions for its key shall make `get` throw, never return `null`.

## Examples

- Given a saved record for `coder` in `/workspaces/acme`,
  when it is damaged and read,
  then it throws an error naming `coder` and `/workspaces/acme`.
- Given an empty memory instruction trust store,
  when `coder` in `/workspaces/acme` is damaged,
  then it throws naming them, and reading `coder` still gives `null`.
- Given a record with a field a record doesn't have,
  when it is read,
  then it throws, naming the agent and its location.
