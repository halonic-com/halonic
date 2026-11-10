# events.tool-result-risk

- Status: active
- Since: 0.1.0
- Source: [HAL-2831](/HAL/issues/HAL-2831), Liam's decision of 10 Nov; asked for by the runs list ([HAL-2829](/HAL/issues/HAL-2829))

The events package shall let a `tool.result` event say what its tool can do in an optional `risk` (`read`, `write` or `send`), and what one call of a sending tool sends in an optional `noun` with a singular `one` and a plural `many`, such as `{ one: "email", many: "emails" }`. Both are copied from the tool's integration sheet when the call ends, so the log stays the record even if the sheet changes or the integration is removed later. Logs written before the fields existed read as before.

A reader that says what a run sent follows these rules:

- It counts a call as sent only when its `tool.result` has `risk: "send"` and `outcome: "ok"`. One call is one noun: two such calls with the noun `email` are "2 emails".
- A call with `risk: "send"` and `outcome: "unknown"` may have sent. It is never counted as sent.
- A missing `risk` (an older log, or a tool without a sheet) means the log doesn't say, never "sent nothing". A run "sent nothing" only when it made no tool call at all.
- A call with `risk: "send"` and no `noun` is left out of what the run sent.

## Examples

- Given a `tool.result` event with `risk: "send"` and `noun: { one: "email", many: "emails" }`,
  when its type is checked,
  then it is a valid run event.
- Given a `tool.result` event with `risk: "read"` and no `noun`,
  when its type is checked,
  then it is a valid run event.
- Given a `tool.result` event without `risk` and `noun`,
  when its type is checked,
  then it is a valid run event.
- Given the risk type,
  when it is listed,
  then it is exactly `read`, `write` and `send`.
