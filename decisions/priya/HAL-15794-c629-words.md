# Decision: a failed Undo says there's a new file in its place, and "the new one" is what to move

- Approval: /HAL/issues/HAL-15794 (words check C629 of /HAL/issues/HAL-15781, row 63), wording on an approved toast, decided by the team (HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:f8I53UE6xgeVyMNIB9SeE4hO53n1rT49PABd8EwZvhSogcm9Sj4rtQgrIiN8Hb1xxW12SFWNtxOJihugbR62Dw==

When Undo can't put a deleted file back because a new file has taken its place, the toast's title is "Couldn't put *notes.md* back" and its second line was the host's sentence "notes.md can't be put back, because there is a new notes.md. Rename or move it, then undo again." So the toast said "can't be put back" twice, "a new notes.md" read as the same file, and "it" could be either file. The host's sentence is now "There's a new *notes.md* in its place. Rename or move the new one, then undo again." The title stays as it is.

The sentence comes from `deleteWithUndo`, so Files, the Library, routines, and the agent and workflow deletes from #4493 all change together. The sentence no longer names the item, so the `name` a caller passed only for it goes.

- studio.undoable-delete: the rule and its example quote the new sentence.
- studio.workspace-files-delete: the example of a new `notes.md` made after the delete now quotes the sentence it rejects with.
- files.ui.delete-file: the example "Undo is pressed after another change" described the behaviour before HAL-15138, when a later change made Undo fail. Undo now succeeds then, so the example is the case where it still fails, a new file made after the delete, and quotes the toast's two lines.

The tests that quoted the old sentence quote the new one; no test is removed or weakened.

## Covers

- studio.undoable-delete
- studio.workspace-files-delete
- files.ui.delete-file
