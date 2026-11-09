# memory.trust-store

- Status: active
- Since: 0.1.0
- Source: HAL-181; `TrustStore` port v1

The memory trust store shall keep each record as JSON text, so that every read gives a fresh copy. For tests, `damage(location)` shall make that location's record unreadable, after which `get` and `list` throw an error naming the location. `damage` on a location without a record shall throw and create nothing.

## Examples

- Given a granted record for `/workspaces/acme`,
  when `damage("/workspaces/acme")` is called and the record is read,
  then it throws an error naming `/workspaces/acme`.
- Given an empty memory trust store,
  when `damage("/workspaces/never")` is called,
  then it throws naming `/workspaces/never`, and `list` still gives `[]`.
