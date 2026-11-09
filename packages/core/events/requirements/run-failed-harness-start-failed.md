# events.run-failed-harness-start-failed

- Status: active
- Since: 0.1.0
- Source: [HAL-1967](/HAL/issues/HAL-1967), Liam's review of the HAL-189 plan (point 3); task HAL-1728

The events package shall let a `run.failed` event give the reason `harness-start-failed` when the harness program (such as Claude Code or Codex) failed to start for this run, or did not send its first event within its time limit (60 seconds by default).

## Examples

- Given the reason type,
  when it is listed,
  then it includes `harness-start-failed`.
- Given a `run.failed` event with `reason: "harness-start-failed"`,
  when its type is checked,
  then it is a valid run event.
