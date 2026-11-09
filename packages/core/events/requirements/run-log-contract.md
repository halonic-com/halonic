# events.run-log-contract

- Status: active
- Since: 0.1.0
- Source: old app `packages/core/events/src/index.ts` at commit 784f78d; `llm.response.paidBy` from HAL-2311

The events package shall describe every run log event with the same type name and the same fields, required or optional, as the reference run log, so run logs written by the old repo and by the new one read the same.

## Examples

- Given the reference run log types,
  when the event types of the events package are listed,
  then they are exactly the 23 reference names, from `run.started` to `run.failed`, plus the events added since, each with its own requirement (`sandbox.opened`, `events.sandbox-opened`; `llm.skipped`, `events.llm-skipped`; `sandbox.started` and `harness.started`, `events.started-events`; `sandbox.blocked`, `events.sandbox-blocked`; `connector.started`, `events.connector-started`).
- Given the reference fields of `llm.response`,
  when the events package's `llm.response` event is compared with them,
  then it has the same required fields (`agent`, `provider`, `model`, `usage`, `latencyMs`, `text`) and the same optional ones (`thoughts`, `cost`, `cached`), plus the optional `toolCallAsText` that came with the engine and the optional `paidBy` that came with the harness bridge.
- Given the six fields that come with the engine, `tool.result.outcome`, `run.failed.reason`, `approval.resolved.by`, `llm.response.toolCallAsText`, `llm.response.paidBy` and `run.failed.host`,
  when the events package is checked,
  then each is optional and has its own requirement (`events.tool-result-outcome`, `events.run-failed-reason`, `events.approval-resolved-by`, `events.tool-call-as-text`, `events.summary-cost`, `events.run-failed-model-unreachable`), and no reference field changes.
