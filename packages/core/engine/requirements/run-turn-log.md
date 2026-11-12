# engine.run-turn-log

- Status: active
- Since: 0.1.0
- Source: HAL-5206 (the code review of 11 Nov found that a run's own model calls logged only `tool.refused`, so a run's `cost` and its budget missed them)

When the engine makes a run's model call, the call's turn shall write its events to the run's log as `engine.turn-logs-events` says, in the call's `foreach` item or `parallel` branch, and so shall the turn of every subagent the call hands a task to, after that subagent's `agent.started`. Each `llm.response` carries the call's `cost` (`engine.turn-prices-calls`), so the run's summary counts what the run's own model calls cost and the budget sees it (`engine.budget-stops`). A tool result over 256 KB goes to the blob store (`engine.large-results-to-blobs`).

## Examples

- Given a run whose model call costs 0.60 EUR,
  when the run completes,
  then its log holds the call's `llm.request` and `llm.response`, and its summary's `cost` is 0.60.
- Given a run budget of 0.50 EUR and a run with two task states whose first model call costs 0.60 EUR,
  when it reaches its second task state,
  then it fails there with the reason `budget`, and makes no second call.
- Given a run's agent that delegates a task to `checker`, whose call costs 0.60 EUR,
  when the run completes,
  then its log holds `checker`'s `agent.started` with the parent agent, its `llm.request` and `llm.response` with the cost, and its `agent.finished`, and the summary counts its cost.
- Given a run's model call whose tool gives a result over 256 KB,
  when the call runs,
  then the log's `tool.result` names the blob that holds the whole result.
