# engine.turn-logs-events

- Status: active
- Since: 0.1.0
- Source: HAL-1061; the run log events already exist

Where a model turn has a run log, the engine shall write an `llm.request` before and an `llm.response` after each model call, with the agent, the provider, the model, the number of messages sent, the usage, the time the call took and the answer's text, and a `tool.called` before and a `tool.result` after each tool it runs. A refused call shall write no `tool.called`. A turn without a run log shall write nothing.

## Examples

- Given a run log, a fixed clock and a model that calls `lookup` once,
  when the turn runs,
  then the log holds `llm.request`, `llm.response`, `tool.called`, `tool.result`, `llm.request`, `llm.response`, in that order.
