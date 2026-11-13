# engine.turn-logs-risk

- Status: active
- Since: 0.1.0
- Source: HAL-2831, Liam's decision of 10 Nov; the field is `events.tool-result-risk`

When the engine writes the `tool.result` of a call to a server's tool that has a `risk`, the engine shall copy that `risk` into the event, the higher of the listing's and the sheet's when both give one (requirement `engine.turn-declared-tools`). It shall leave `risk` out when neither the listing nor the sheet bound to the connector gives one, and for Halonic's own tools, so readers count those calls as unknown, never as sending nothing.

## Examples

- Given a server tool `send_email` listed with `risk: "send"`,
  when the model calls it and it answers,
  then its `tool.result` has `outcome: "ok"` and `risk: "send"`.
- Given a server tool `send_email` listed with `risk: "send"` that throws,
  when the model calls it,
  then its `tool.result` has `outcome: "error"` and still `risk: "send"`.
- Given a server tool whose listing and whose connector's sheet give no `risk`, or one of Halonic's own tools,
  when the model calls it,
  then its `tool.result` has no `risk`.
