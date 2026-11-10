# Decision: a wait step's description is filled in once, by core

- Approval: Liam decided this on [HAL-1218](/HAL/issues/HAL-1218) (architecture decision from the halonic#741 review, HAL-2560); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-1218

## What changes

`engine.wait-state` now also says that `run.waiting` carries the state's description, filled in
against the run as a `title` (first line) and a `body` (the rest), with an empty title or body left
out. Two examples are added: a described wait state and one without a description. No example was
removed or weakened.

`events.run-log-contract` lists the two new optional fields, `run.waiting.title` and
`run.waiting.body`, with their own requirement, `events.waiting-description`. No reference field
changes, so old logs read as before.

## Why

From halonic#741 on, Acme's `review` step description holds `{{context.reply}}`. Liam decided that
core fills it in once and that the Inbox card and the `halonic run` waiting line both use that one
result. Filling it in when the run starts waiting, and writing it to the log, means every reader
(Studio, the CLI, run receipts, a log read later) shows the same text without the workflow
definition or the run's context at hand.

Blank lines at the start and end of the body are dropped, so a placeholder on the body's first line
that resolves to nothing doesn't leave the card body starting with an empty line. Inside the body it
stays an empty line, as decided.

## Covers

- engine.wait-state
- events.run-log-contract
- packages/core/engine/src/states/wait/state.test.ts
- packages/core/events/src/run-event.test.ts
