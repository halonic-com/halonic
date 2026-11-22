# events.run-failed-rejected-answer

- Status: active
- Since: unreleased
- Source: HAL-16441, the board's analysis of 62 DeepSeek runs on HAL-16440 (22 Nov)

The events package shall let a `run.failed` event carry, in an optional `rejected`, the agent's answer that failed the run, in full: `answer`, its text as the agent gave it, empty when it gave none, and, for a `json` output, `parseError`, what the JSON parser said. `run.failed` quotes at most 120 characters of an answer in `error`, and a harness agent's final answer isn't otherwise in the log. A `run.failed` without `rejected`, as every older log has, shall load as before.

## Examples

- Given a `run.failed` event,
  when its fields are listed,
  then `rejected` is among them, optional, with `answer` required and `parseError` optional.
