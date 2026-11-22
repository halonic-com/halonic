# Decision: an Undo that can't put a deleted item back yet keeps Undo

- Task: HAL-15787
- Approval: HAL-15787 (flow check C630 finding 3 on HAL-15782; fix 1 of the two the finding gives, built on the approved delete-with-Undo flows, decided by the team under the HAL-2282 rule). Liam signs this note at code review.
- Kind: user-visible

## What changes

When a new file has taken the place of a deleted file, agent, workflow, routine or Library item,
Undo fails with "*name* can't be put back, because there is a new *path*. Rename or move it, then
undo again." That toast closed by itself and had no action, and for a file it also took the open
tab's Undo away, so after the rename there was nothing left to press. Now the failure toast stays,
with **Undo**, which tries the put-back again, and a file's open tab keeps its "This file was
deleted" strip and Undo until the file is back. The sentence itself is unchanged; it is now true.

The active requirements `files.ui.delete-file` and `library.library-delete`, and the drafts
`agents.page.menu`, `workflows.page.menu` and `routines.list.delete-with-undo`, gain "in a toast that
stays, with Undo" and their examples say so. The `files.ui.delete-file` example "Given Undo can no
longer bring `notes/a.md` back, then the tab says … isn't in this workspace any more" becomes "the
tab keeps This file was deleted with Undo"; its test in `file-view-trash.test.tsx` now fails the
first Undo and checks that the second one brings the file back. The other put-back failure tests
also check that the toast stays with Undo, and the files, Library and routines ones press it again.
No test was removed, weakened or skipped.

## Why

A message that says "then undo again" must leave an Undo to press (E2: every refusal says what to do
next, and the next step has to be possible). The workspace's own undo is no way back here: it would
first undo the person's later edits, such as the rename.

## Covers

- files.ui.delete-file
- library.library-delete
- agents.page.menu
- workflows.page.menu
- routines.list.delete-with-undo
