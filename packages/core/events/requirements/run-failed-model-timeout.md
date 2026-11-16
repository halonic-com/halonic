# events.run-failed-model-timeout

- Status: active
- Since: 0.1.0
- Source: Liam's decision on HAL-902 (a limit on the first answer only); task HAL-1308, decision note `decisions/elena/t15-pr6a.md`

The events package shall let a `run.failed` event give the reason `model-timeout` when the model's provider was reached but gave no first answer in time, so a person learns that a local model may still be loading and can run again, not that it is missing or broken. There is no limit on the whole answer. It names the host that didn't answer in the optional `host`, as `model-unreachable` does. The `error` text stays the message to show.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `model-timeout`.
- Given a `run.failed` event with `reason: "model-timeout"`,
  when its type is checked,
  then it is a valid run event.
- Given a `run.failed` event with `reason: "model-timeout"` and `host: "localhost:11434"`,
  when its type is checked,
  then it is a valid run event.
