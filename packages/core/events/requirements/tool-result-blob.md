# events.tool-result-blob

- Status: active
- Since: 0.1.0
- Source: HAL-1533, step 4(d) of the HAL-186 plan; the port ADR's "blob hash reference for payloads over 256 KB" (`docs/adr/2026-11-07-port-list-and-versions.md`)

The events package shall let a `tool.result` event keep a result too large for the run log in the blob store, with an optional `resultBlob` that gives the blob's `hash` (lowercase hex SHA-256 of the bytes), `size` in bytes and `mediaType`. When `resultBlob` is set, `result` shall hold only the start of the result, and the whole result is the blob's bytes. Logs written before the field existed read as before, and a `tool.result` without `resultBlob` holds its whole result in `result`.

## Examples

- Given a `tool.result` with a short `result` and a `resultBlob`,
  when its type is checked,
  then it is a valid run event.
- Given a `tool.result` without `resultBlob`,
  when its type is checked,
  then it is a valid run event, and its `result` is the whole result.
