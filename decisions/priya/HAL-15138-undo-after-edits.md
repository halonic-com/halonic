# Decision: Undo puts a deleted file, Library item or routine back after later edits

- Approval: /HAL/issues/HAL-15138 (C544 finding 9 in Iris's flow check HAL-15101, the follow-up of HAL-15120; it extends a behaviour the team already chose for workflows and agents in #4493)
- Kind: user-visible

Delete's Undo in Files, the Library and Routines worked only while the delete was the newest change: after any other edit it refused, and the deleted item could only come back by undoing that edit first. #4493 gave workflows and agents `deleteWithUndo` (`studio.undoable-delete`), which writes the files back as a change of its own after later edits and refuses only when a new file has taken their place. The files host, the Library and routines now use it too.

- studio.workspace-files-delete: the way back is that of `studio.undoable-delete`. The example "another change was made after the delete, then it rejects" now puts `notes.md` back as "Put back notes.md" and keeps the other change; a new example covers the refusal when a new `notes.md` was made.
- files.ui.delete-file: "Undo shall bring the file back while the delete is the newest change" becomes "after later changes too". The host's refusal sentence it shows is the new one.
- library.library-delete: "only while the delete is still the newest step" becomes "after later changes too", refusing only when a new file has taken the item's place. The example of an edit after the delete now puts the skill back; a new example covers the refusal.
- studio.workspace-routines: a delete's way back is that of `studio.undoable-delete`; one example is added.

No test is weakened. The tests that expected a refusal after a later edit now expect the item back with the other edit kept, and each host has a test for the refusal when a new file took the place (`conflict`, nothing written). The host's sentence changes from "because the workspace changed after it was deleted" to the one `studio.undoable-delete` names, so the tests quoting it follow. `studio.undoable-delete` (still a draft) also writes back only the missing files when some are back with their old text, from Liam's review of #4493.

The delete tests of the files host and of routines move, unchanged apart from the above, into `workspace-files-delete.test.ts` and `workspace-routines-delete.test.ts`, because their files went over the 500-line limit. So `workspace-files-host.test.ts` and `workspace-routines.test.ts` run fewer tests than on the merge base; nothing is dropped.

## Covers

- studio.workspace-files-delete
- files.ui.delete-file
- library.library-delete
- studio.workspace-routines
- apps/studio/src/files/workspace-files-host.test.ts
- apps/studio/src/routines/workspace-routines.test.ts
