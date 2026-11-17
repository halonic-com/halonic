# Decision: the changed-outside strip offers only Compare; Keep mine and Use the other one move into Compare

- Task: HAL-11383
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11383 (item F3 of the design check HAL-11370, which cites the board-approved microcopy row mc 16; Liam's review of #3268 on HAL-11420 accepted it; a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Supersedes: `HAL-11117-files-outside-strip.md`, for the strip's buttons only (its quiet-reload toast stays)

## What changes

The strip of a file with unsaved changes that changed outside Halonic shows **Compare** only, and
"changed outside Halonic" has no full stop. **Keep mine** and **Close** stay in the strip of a
deleted file. **Load theirs** is gone: in Compare the same choice is **Use the other one**. Compare
takes focus when it opens, and the editor takes focus after a choice or when Compare is cancelled.
After a choice a line says "Keeping yours", "Using the other one" or "Combined", is announced, and
goes at the next edit. Each choice is still saved at once as one undo step.

The requirements `files.ui.outside-strip`, `files.ui.file-tab`, `files.ui.problems-list`,
`files.ui.large-or-not-text`, `files.ui.tree-view`, `files.ui.new-file` and `shell.save-note` say
what the rest of #3268 does.

## Why

Two design checks gave opposite answers in two days. HAL-11098 led to Keep mine and Load theirs in
the strip (HAL-11117). HAL-11370 F3 found that the approved row (mc 16) has only Compare and that
"Load theirs" is in no approved row. We follow F3 because it cites the approved microcopy. Nothing
is lost: Compare offers both choices, so spec 2.4 is covered through Compare, and Undo still brings
the other text back. A later check should not reverse this without a new approved row.

## Covers

- files.ui.outside-strip
- files.ui.file-tab
- files.ui.problems-list
- files.ui.large-or-not-text
- files.ui.tree-view
- files.ui.new-file
- shell.save-note
