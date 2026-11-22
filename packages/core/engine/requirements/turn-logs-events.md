# engine.turn-logs-events

- Status: active
- Since: 0.1.0
- Source: HAL-1061; the run log events already exist; `tool.refused` from HAL-4658; its `sending-off` reason from HAL-15772

Where a model turn has a run log, the engine shall write an `llm.request` before and an `llm.response` after each model call, with the agent, the provider, the model, the number of messages sent, the usage, the time the call took and the answer's text, and a `tool.called` before and a `tool.result` after each tool it runs. A refused call shall write no `tool.called` or `tool.result`. A call to a tool the turn didn't offer shall write one `tool.refused` instead, with the agent, the tool's name exactly as the model wrote it, the call's id and the reason `not-offered` (`events.tool-refused`), and a call in a run to a connector's tool labelled `send` whose connector may not send shall write one with the reason `sending-off` and the connector's id (`engine.run-connector-calls`). A turn without a run log shall write nothing.

## Examples

- Given a run log, a fixed clock and a model that calls `lookup` once,
  when the turn runs,
  then the log holds `llm.request`, `llm.response`, `tool.called`, `tool.result`, `llm.request`, `llm.response`, in that order.
- Given a run log and a model that calls `delete_everything`, which the turn didn't offer, with the call id `c1`,
  when the turn runs,
  then the log holds `llm.request`, `llm.response`, one `tool.refused` naming `delete_everything`, `c1` and `not-offered`, `llm.request`, `llm.response`, in that order, and no `tool.called` or `tool.result`.
