# engine.child-tells-parent

- Status: active
- Since: 0.1.0
- Source: HAL-1535, step 5(a) of the HAL-186 plan; running again after a wait from HAL-6173

When a step leaves a child run waiting, completed or failed, or running again after it waited, the engine shall ask to tell its parent run, with a `tell-parent` effect that names both runs. A run without a parent, and a step that leaves a run going that was going before it, shall tell no one.

## Examples

- Given a child run of a workflow that starts in a `wait` state,
  when it starts,
  then the step asks to tell its parent.
- Given a child run of a workflow with a task state,
  when it starts and asks for the model call,
  then it tells no one; when the answer completes it, it tells its parent.
- Given a child run of a workflow that waits for `approve`, then moves on to a task state,
  when `approve` is sent to it and it asks for the model call,
  then it tells its parent.
- Given a run with no parent,
  when it waits,
  then it tells no one.
