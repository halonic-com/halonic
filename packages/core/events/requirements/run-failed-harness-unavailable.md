# events.run-failed-harness-unavailable

- Status: active
- Since: 0.1.0
- Source: HAL-4215, Liam's review of the test runner plan on HAL-4224: the test runner tells a step that would start a program from a typed reason, not from the error's text

The events package shall let a `run.failed` event give the reason `harness-unavailable` when the step's agent runs in a harness program (such as Claude Code or Codex) and the engine that ran it has no harnesses, as in workflow tests, which never start programs.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `harness-unavailable`.
- Given a `run.failed` event with `reason: "harness-unavailable"`,
  when its type is checked,
  then it is a valid run event.
