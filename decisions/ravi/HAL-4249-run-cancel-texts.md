# Decision: the run cancel texts speak in one voice and don't say "harness"

- Approval: the words check on [HAL-4240](/HAL/issues/HAL-4240) (#1317) asked for this on [HAL-4249](/HAL/issues/HAL-4249); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-4249

## What changes

`engine.local-run-cancel` now names the three texts a cancel gives:

- a cancelled run fails with the error "The run was cancelled." (was "Someone cancelled the run.");
- a harness call stopped by the cancel fails with "The run was cancelled while the agent was
  working." (was "The run was cancelled while the harness ran.");
- a cancel of a run that doesn't exist is refused with `There's no run "<id>".` (was
  `No run "<id>".`).

The behaviour stays the same: the same events, the same `reason: "cancelled"` and the same
`engine.run-unknown` code. No example was removed or weakened; the test of the unknown run now also
checks its message.

## Why

Users don't know the word "harness" (it is not in the glossary), and the two cancel texts used two
voices, active and passive. `There's no run` matches the approved CLI wording ("There's no run x in
acme."). This is small wording on behaviour the board already approved, which the team decides
(board, HAL-2282), so the note is internal.

## Covers

- engine.local-run-cancel
- packages/core/engine/src/run/local-runs-cancel.test.ts
