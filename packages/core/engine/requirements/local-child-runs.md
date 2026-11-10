# engine.local-child-runs

- Status: active
- Since: 0.1.0
- Source: HAL-1535, step 5(a) of the HAL-186 plan; "Subflows" in docs/specs/workflow-semantics.md

When a step of the local executor asks for a child run, the executor shall start it at once, in the parent's hub and of its kind, with the parent's kept definitions and the parent recorded in its `run.started`. When a child's step asks to tell its parent, the executor shall give the parent how the child is then, in the same call, so a parent goes on as soon as its child completes. When an event is sent to a run that waits on a child that waits, the executor shall pass the event, unchanged, to that child. When a child can't start, or ends because the executor failed it or found it interrupted, the executor shall tell its parent, so the parent fails too.

## Examples

- Given an `onboard` run whose `check` state runs the `approval` workflow,
  when it starts,
  then a child run `run_1.2` of `approval` starts with `parent: { runId: "run_1", state: "check", depth: 1 }`, and the parent waits for `approve` or `reject`.
- Given that parent,
  when `approve` is sent to it,
  then the child takes the event and completes, and the call returns the parent completed with the child's context under `verdict`.
- Given a child whose blob store can't keep its definitions,
  when the parent starts,
  then the parent fails with `The child run couldn't start:` and the reason.
- Given a waiting parent whose child was making a model call when the engine stopped,
  when the next engine starts its first run,
  then the child ends as interrupted and the parent fails.
