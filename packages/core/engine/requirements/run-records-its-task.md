# engine.run-records-its-task

- Status: active
- Since: unreleased
- Source: HAL-17254, token phase 1e (direction on HAL-16892, section 3; the board's yes on HAL-16897)

When a run is started with a `task`, the engine shall record it on the run's `run.started` as it was given: the task's id and, when given, its branch. A child run that a `workflow` state starts shall record its parent's `task` on its own `run.started`, so its tokens add up on the same task and pull request. A run started without a `task` shall record none.

## Examples

- Given a start of "reply" with `task: { id: "HAL-42", branch: "acme/HAL-42-reply" }`,
  when the executor starts it,
  then its `run.started` has that `task`, and the run's state has it too.
- Given a parent run of "onboard" started with `task: { id: "HAL-42" }` whose `workflow` state runs `reply`,
  when the child run starts,
  then the child's `run.started` has `task: { id: "HAL-42" }`, and both runs add up on task `HAL-42`.
- Given a start without `task`,
  when the executor starts it,
  then its `run.started` has no `task`, and the run's state has `task: null`.
