# ports.harness-run-events

- Status: active
- Since: 0.1.0
- Source: plan HAL-9 section 4.5 (v1.17), "A harness run is still a Halonic run"; HAL-1484

The `Harness` port shall describe what a harness reports as run log events of existing types, without the fields the engine adds, so Runs, the receipt, budgets and the inbox read a harness run as they read a run of the built-in agent loop. It shall add no event type of its own.

## Examples

- Given the `HarnessEvent` type,
  when its event types are listed,
  then each is a run log event type: `agent.started`, `llm.request`, `llm.response`, `llm.fallback`, `knowledge.searched`, `tool.called`, `tool.result`, `approval.requested` and `agent.finished`.
- Given an `llm.response` a harness reports, with `usage` and `cost`,
  when it is compared with the run log's `llm.response`,
  then it has the same fields, so budgets count its tokens and cost.
- Given a harness event with a `state` field, or an event of a type the run log doesn't have, such as `sandbox.blocked`,
  when it is compiled,
  then it doesn't compile.
- Given an `approval.requested` event without `resume`,
  when it is compiled,
  then it compiles, because a program can't be resumed; the built-in loop sets it.
