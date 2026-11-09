# engine.task-state

- Status: active
- Since: 0.1.0
- Source: HAL-1526, step 3(a) of the HAL-186 plan

When a run enters a plain `task` state, the engine shall record `agent.started` with the state's prompt and ask for one model call under a new call id. When the answer to that call comes back, the engine shall record `agent.finished`, write the answer to the state's `output` key in the context when it has one, and take the state's first `done` transition whose guard passes. When no `done` transition matches, the engine shall fail the run. An answer to any other call shall change nothing.

## Examples

- Given a `draft` task state with the prompt `Reply to {{input.from}}`, `output: reply` and a `done` transition to `sent`,
  when the run starts with `from: support`,
  then the engine records `agent.started` with `Reply to support` and asks for `call-1`;
  and when `call-1` answers `On its way`, it records `agent.finished`, sets `reply` and moves to `sent`.
- Given the same run,
  when an answer for `call-9` arrives,
  then nothing is recorded.
