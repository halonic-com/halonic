# Decision: the tracker-links check, and plain task ids in the Source line of 15 more requirements

- Task: HAL-7143 (the guard) and HAL-7167 (its leftovers)
- Approval: Liam approved the guard and asked for these leftovers in his review on HAL-7151, and signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xKlqs5byJXMj5mUPYJxBk0pLsA+BkZqjhXNB+IezYm6EKSISUhLt3WPP4y2XIDUDIhY2mLFE7KfpDjvhjnfkCQ==

## What changes

A new `tracker-links` rule in `tooling/check/` fails `pnpm check` on a Markdown link to the
task tracker, as agreed on HAL-7136. It comes with its requirement `check.tracker-links` and its
tests. The guard counts any change under `tooling/check/` as a change to its own paths, so it
needs this note.

In the covered requirements, only the `- Source:` line changes. These seventeen gained a tracker link after
the cleanup in #2124 and #2125 ran, so the new `tracker-links` check in this pull request would
fail on them. The same script as in part 1 rewrote them, with no hand edits: a link such as
`[HAL-4758](/HAL/issues/HAL-4758)` becomes `HAL-4758`.

No statement, example or status changes, so no behaviour, test or golden file changes. The
guard counts any change to an active requirement's file as an edit, so the Source lines need
this note.

## Covers

- tooling/check/
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
- runs.run-view.run-log
- engine.parallel-branch-method
- runs.run-view.step-events
- cloudflare-storage.r2-blob-store
