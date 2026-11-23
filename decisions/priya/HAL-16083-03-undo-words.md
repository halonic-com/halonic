# Decision: Undo says when it undid part of a decision, or a later decision kept it back

- Requirement: `inbox.proposal-page`, `studio.workspace-proposal-decisions`
- Task: HAL-16083, from Sofia's words check C665 row 31 on HAL-16066
- Approval: Liam approved row 31 and Sofia's toast on HAL-16083; he approves this note in review
- Kind: user-visible

## What changes

Since #5035 a file the host can't put back on **Undo** keeps its decision, and the host's answer
says when a later decision kept the whole Undo back (`decidedAfter`). Studio passes that on, and
the Inbox words it as Sofia wrote it (C665 row 31, microcopy 16's Partly undone):

- some files put back: a warning toast "Undid part of the changes from run 01JD8Q" with
  "Couldn't put back notes/a.md: it changed after it was accepted.";
- none put back because they changed: "Couldn't undo this." with "notes/a.md changed after it was
  accepted, so it stays accepted.", as before;
- a later decision kept it back: "Couldn't undo this: you decided more of run 01JD8Q's changes
  after it."

For several files the part line says "Couldn't put back 2 files: they changed after they were
accepted.", in the form of the existing line's plural.

## Why

Before, every file left alone read "changed after it was accepted", which isn't true when a later
decision kept the Undo back, and a partial Undo looked like a failed one.

## Tests

The test "offers only the newest decision's Undo, and keeps a file the host didn't put back" is
now the later-decision case and expects its sentence; a new test keeps the "none put back" case
with the old words. "puts back only the files the host restored" now expects the part toast. The
Studio test for the restore answer also checks `decidedAfter`, and a new one covers `true`. No test
makes fewer `expect` calls.

## Covers

- inbox.proposal-page
- studio.workspace-proposal-decisions
