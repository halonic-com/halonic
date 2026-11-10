# engine.turn-logs-risk

- Status: active
- Since: 0.1.0
- Source: [HAL-2831](/HAL/issues/HAL-2831), Liam's decision of 10 Nov; the field is `events.tool-result-risk`

When the engine writes the `tool.result` of a call to a server's tool whose listing gives a `risk`, the engine shall copy that `risk` into the event. It shall leave `risk` out when the listing gives none, and for Halonic's own tools, so readers count those calls as unknown, never as sending nothing.

## Examples

- Given a server tool `send_email` listed with `risk: "send"`,
  when the model calls it and it answers,
  then its `tool.result` has `outcome: "ok"` and `risk: "send"`.
- Given a server tool `send_email` listed with `risk: "send"` that throws,
  when the model calls it,
  then its `tool.result` has `outcome: "error"` and still `risk: "send"`.
- Given a server tool listed without `risk`, or one of Halonic's own tools,
  when the model calls it,
  then its `tool.result` has no `risk`.
