# studio.undoable-delete

- Status: draft
- Since: unreleased
- Source: HAL-15120 (C544 finding 9, HAL-15101)

When a host of the desktop app deletes an item's files, it shall delete them as one undoable change of the workspace's files and keep their text, and the delete's way back shall put them back as they were: by the workspace's undo while the delete is still the newest change, and after any other change by writing them back as a change of its own named "Put back *item*", keeping the other changes. When the files are back already, undone some other way, the way back shall do nothing. When a file has taken the place of one of them since the delete, the way back shall reject with `conflict`, write nothing, and name that file and what to do: "*name* can't be put back, because there is a new *path*. Rename or move it, then undo again."

## Examples

- Given `notes.md` deleted, when its way back runs straight after, then the workspace's undo takes the delete back.
- Given `notes.md` deleted and then `todo.md` changed, when its way back runs, then `notes.md` is back byte for byte as "Put back notes.md", and `todo.md` keeps its change.
- Given `notes.md` deleted and then put back by the workspace's undo, when its way back runs, then nothing is written.
- Given `notes.md` deleted and a new `notes.md` made after, when its way back runs, then it rejects with "notes.md can't be put back, because there is a new notes.md. Rename or move it, then undo again." and the new file stays.
