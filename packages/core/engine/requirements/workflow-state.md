# engine.workflow-state

- Status: active
- Since: 0.1.0
- Source: HAL-1535, step 5(a) of the HAL-186 plan; "Subflows" in docs/specs/workflow-semantics.md

When a run enters a `workflow` state, the engine shall record `workflow.started` and ask for a child run of the named workflow, from the definitions the run started with, with the state's `input` rendered against the scope and a depth one more than the run's. While the child waits, the engine shall record `run.waiting` with the child's id and the events the child takes, once for each change. When the child completes, the engine shall record `workflow.finished`, write the child's final context to the state's `output` and take the `done` transition. When the child fails, the engine shall record `workflow.finished` and fail the run. When the state names no workflow, a workflow the run's definitions don't have, or would start a child more than 5 deep, the engine shall fail the run with an error that says so.

## Examples

- Given an `onboard` run whose `check` state runs `approval` with the input `{ who: "{{input.from}}" }`,
  when the run enters `check`,
  then the engine records `workflow.started` and asks for a child run of `approval` with `{ who: "support" }` and depth 1.
- Given that child,
  when it waits for `approve` or `reject`,
  then the parent records `run.waiting` with the child's id and `approve, reject`.
- Given that child,
  when it completes with the context `{ ok: 1 }`,
  then the parent records `workflow.finished`, sets `verdict` to `{ ok: 1 }` and moves on `done`.
- Given a run that is already 5 deep,
  when it enters a `workflow` state,
  then it fails with an error that names the limit of 5.
