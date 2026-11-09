# events.tool-result-outcome

- Status: active
- Since: 0.1.0
- Source: [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan), "Idempotency keys and unknown outcome"; task HAL-1525

The events package shall let a `tool.result` event say how its tool call ended in an optional `outcome`: `ok` when the tool answered, `error` when it failed, or `unknown` when the call broke off without an answer, so the tool may or may not have done its work. Logs written before the field existed read as before; a missing `outcome` means the log doesn't say, not `unknown`.

## Examples

- Given a `tool.result` event with `outcome: "unknown"`,
  when its type is checked,
  then it is a valid run event.
- Given a `tool.result` event without `outcome`,
  when its type is checked,
  then it is a valid run event.
- Given the outcome type,
  when it is listed,
  then it is exactly `ok`, `error` and `unknown`.
