# events.agent-finished-error

- Status: active
- Since: 0.1.0
- Source: [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan), step 5(b); `docs/specs/workflow-semantics.md`, "Parallel"; task HAL-1536

The events package shall let an `agent.finished` event say that its agent failed without failing the run, in an optional `error` (the failure's message) and an optional `reason` (a `run.failed` reason, such as `model-unreachable`). An `agent.finished` with `error` shall have `output: null`. Logs written before the fields existed read as before: an `agent.finished` without `error` means the agent answered.

## Examples

- Given a parallel branch whose model call failed while the other branches go on,
  when its `agent.finished` is typed,
  then it may carry `error: "No model answered"` and `reason: "model-unreachable"`.
- Given an `agent.finished` event without `error`,
  when its type is checked,
  then it is a valid run event, as in older logs.
