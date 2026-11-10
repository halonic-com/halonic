# Decision: `read_run` answers `No events yet.` for a run without events

- Approval: Liam's review nits on #872, recorded on [HAL-3080](/HAL/issues/HAL-3080) and carried into [HAL-3086](/HAL/issues/HAL-3086); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-1533

## What changes

The `engine.run-log-tools` requirement gains one sentence: when a run has none of the events
`read_run` shows, it answers `No events yet.` Before, it answered with an empty text.

Nothing else in the requirement changes. The `list_runs` tool description stops promising "model
calls", which the line never showed; the requirement already listed the right fields.

## Why

An empty answer tells the model nothing: it can't tell an empty run from a failed tool call. A
short sentence, like `No runs in that period.` for `list_runs`, says what happened.

No test was weakened or removed; the existing tests gain a case for the empty run.

## Covers

- engine.run-log-tools
- packages/core/engine/src/tools/run-log/run-log-tools.test.ts
