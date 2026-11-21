# studio.workspace-files-delete

- Status: active
- Since: unreleased
- Source: HAL-329 files flow 5; HAL-10902; HAL-12368 (UX check L6); HAL-14552 for the file manager on each computer (C415 SK1); HAL-15138 (C544 finding 9: Undo after later edits)

The app's files host shall delete one file as one undo step that goes to the trash when saved, and say how many places in other files name a deleted Library item (a skill, knowledge source, collection or connector) by its id. Its way back shall be the way back of `studio.undoable-delete`, which puts the file back after later changes too and rejects, undoing nothing, only when a new file has taken its place. It shall refuse a file that isn't there and a `SKILL.md` whose folder has other files (the whole folder doesn't go yet); that refusal is `unavailable` and says what to do instead, because deleting again can't help: delete the skill's folder in File Explorer on Windows, with the path written with backslashes, in Finder on macOS, and in "your file manager" on Linux.

## Examples

- Given agent `helper` lists the skill `refunds`, when `hubs/support/library/skills/refunds/SKILL.md` is deleted, then the file is deleted in one change and the result says 1 place.
- Given `notes.md` is deleted, then the result says 0 places, and its way back undoes the delete.
- Given another change was made after the delete, when the way back is used, then `notes.md` is back as a change labelled "Put back notes.md", and the other change stays.
- Given a new `notes.md` was made after the delete, when the way back is used, then it rejects with `conflict` and the new file stays.
- Given `skills/refunds/` has `SKILL.md` and `script.sh`, when `SKILL.md` is deleted on Windows, then the host rejects with "Studio can't delete a skill that has other files in its folder yet." and the next step "To delete refunds, delete the folder skills\refunds in File Explorer."
- Given the same folder on macOS, then the next step is "To delete refunds, delete the folder skills/refunds in Finder.", and on Linux "To delete refunds, delete the folder skills/refunds in your file manager."
