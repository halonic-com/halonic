# events.run-started-task

- Status: active
- Since: unreleased
- Source: HAL-17254, token phase 1e (direction on HAL-16892, section 3; the board's yes on HAL-16897)

The events package shall let a `run.started` event name, in an optional `task`, the task the run worked on: its `id`, a string the caller chose, and optionally the `branch` the run worked on, which stands for its pull request, so the run's tokens can be added up per task and per pull request. There is no task model: Halonic doesn't look the id up. A `run.started` without `task`, as older logs and runs started without a task have it, shall read as before.

## Examples

- Given a `run.started` event with `task: { id: "HAL-42", branch: "acme/HAL-42-reply" }`,
  when its type is checked,
  then it is a valid run event.
- Given a `run.started` event with `task: { id: "HAL-42" }`,
  when its type is checked,
  then it is a valid run event.
- Given a `run.started` event without `task`,
  when its type is checked,
  then it is a valid run event.
