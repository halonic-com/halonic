# events.run-log-contract

- Status: active
- Since: 0.1.0
- Source: old app `packages/core/events/src/index.ts` at commit 784f78d

The events package shall describe every run log event with the same type name and the same fields, required or optional, as the reference run log, so run logs written by the old repo and by the new one read the same.

## Examples

- Given the reference run log types,
  when the event types of the events package are listed,
  then they are exactly the 23 reference names, from `run.started` to `run.failed`.
- Given the reference fields of `llm.response`,
  when the events package's `llm.response` event is compared with them,
  then it has the same required fields (`agent`, `provider`, `model`, `usage`, `latencyMs`, `text`) and the same optional ones (`thoughts`, `cost`, `cached`).
- Given the three phase 2 fields `tool.result.outcome`, `run.failed.reason` and `approval.resolved.by`,
  when the events package is checked,
  then none of them exists yet.
