# Decision: a run that ends lists no waiting approvals

- Approval: Liam decided this on HAL-1529 (scope note from HAL-186, after PR #490 merged); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-1529

## What changes

`events.summary-approvals-and-signals` said an approval stays in the summary until an
`approval.resolved` with its call id removes it. It now also ends when the run ends: on
`run.completed` and `run.failed` the summary's `approvals` list becomes empty. Three examples are
added: a run cancelled while it waits, a budget stop with two for-each items waiting, and a run that
completes. No example was removed or weakened.

## Why

A run cancelled or stopped by its budget while it waits kept its approvals in the summary, so the
Inbox, the CLI and run receipts would show approvals nobody can answer any more. The engine does not
write an `approval.resolved` in those cases, because nobody decided anything and `by` only allows
`person` or `rule`. The summary is worked out from the log and never stored, so the fix changes
nothing stored, and old logs read correctly too.

## Covers

- events.summary-approvals-and-signals
- packages/core/events/src/summarize.test.ts
