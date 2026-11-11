# Decision: Undo and Redo of a review step follow rule A and the untrusted mark

- Approval: the maintainer approves this change in review of HAL-5218
- Kind: internal

The requirements are tightened; nothing is narrowed and no test was weakened.

`ReviewService.restore` puts back a step from the shared undo history. It
now applies the same two rules as a write: a path the assistant may never
write is listed as held and nothing of it is touched, and a file written
back while the workspace is untrusted gets the written-untrusted mark on its
record. Before, restore used only the store's own path rules and never set
the mark. This matches what the run proposal service already does for its
own steps.

`app.assistant-no-git-or-halonic` and `app.untrusted-changes-held` say so,
and each gains one example.

## Covers

- app.assistant-no-git-or-halonic
- app.untrusted-changes-held
