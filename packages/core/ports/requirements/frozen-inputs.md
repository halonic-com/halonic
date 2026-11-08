# ports.frozen-inputs

- Status: active
- Since: 0.1.0
- Source: HAL-112 (review HAL-121 items 1, 2, 4c, 5, 6 and 7; review HAL-122 item 6; multi-cloud ADR 5.2 to 5.4)

The version 1 ports shall carry every input that an adapter must honor and that the engine needs before phase 3, because adding such an input after the freeze is a breaking change (port list ADR, "The freeze"). These are: a caller-chosen run id on starts, a status filter on the run list, a snapshot written with an append, a close signal on run subscriptions, a scheduler factory that takes its listener, and deleting a coordination value.

## Examples

- Given a `StartRunRequest` or `StartAgentRequest`,
  when it sets `runId`,
  then it compiles, and the request has no `parent` field.
- Given a `RunFilter`,
  when it sets `status` to one status or a list of them,
  then it compiles.
- Given `RunStore.append`,
  when it is called with `{ snapshot }` as a fourth argument,
  then it compiles, and `RunStore.snapshot(runId)` returns a `RunSnapshot` or `null`.
- Given a `RunEventListener`,
  when it is written as a plain function,
  then it doesn't compile: it needs both `onEvent` and `onClose`.
- Given a `SchedulerFactory`,
  when it is called with a `SchedulerListener`,
  then it returns a `Scheduler`.
- Given `Coordination.compareAndSet`,
  when `next` is `null`,
  then it compiles.
