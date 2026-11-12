# Decision: write task ids as plain text in the Source line of 13 more requirements

- Task: HAL-7167, the leftovers of HAL-7143 for the guard (#2126)
- Approval: Liam asked for these leftovers in his review on HAL-7151 and signs this note
- Kind: internal

## What changes

Only the `- Source:` line of each covered requirement. These thirteen gained a tracker link after
the cleanup in #2124 and #2125 ran, so the new `tracker-links` check in this pull request would
fail on them. The same script as in part 1 rewrote them, with no hand edits: a link such as
`[HAL-4758](/HAL/issues/HAL-4758)` becomes `HAL-4758`.

No statement, example or status changes, so no behaviour, test or golden file changes. The
guard counts any change to an active requirement's file as an edit, so the Source lines need
this note.

## Covers

- engine.step-signal
- engine.task-conversation
- inbox.setup-items
- cli.doctor-report
- cli.sandbox-gate
- engine.foreach-item-method
- engine.task-method
- workflow.method-prompt
- google-setup.setup-source
- inbox.setup-pane
- runs.every-step
- engine.step-format
- engine.foreach-item-gets
