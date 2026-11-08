# routines.routine-start

- Status: active
- Since: 0.1.0
- Source: moved from `core/app` (`startRoutine` at 784f78d)

When a routine starts, the routines package shall give what to run with `{{trigger.at}}`, `{{trigger.lastRun}}` and `{{trigger.message}}` filled in: for a workflow, its hub, id and input, where a text that is one placeholder keeps the value's type; for an agent, its hub, id and prompt as text. `trigger.at` is the due time as an ISO text, `trigger.lastRun` the last run as an ISO text or `null`.

## Examples

- Given a workflow routine with input `{ since: "{{trigger.lastRun}}", note: "at {{trigger.at}}" }` placed in hub `h`, when it starts for 2026-01-02T08:00:00Z with last run 2026-01-01T08:00:00Z, then the input is `{ since: "2026-01-01T08:00:00.000Z", note: "at 2026-01-02T08:00:00.000Z" }`.
- Given an agent routine with prompt `Mail: {{trigger.message.subject}}`, when it starts with message `{ subject: "Hi" }`, then the prompt is `Mail: Hi`.
- Given a routine that never ran, when `{{trigger.lastRun}}` is the whole text of an input value, then that value is `null`.
