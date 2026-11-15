# app.workspace-rename

- Status: active
- Since: 0.1.0
- Source: HAL-1293, save model 5; decision on HAL-10506

When the user renames a file, the kernel shall move its text to the new path, mark the old path for deletion and apply the given rewrites to the files that name it, all as one undo step. A saved rename shall remove the old file without sending it to the trash, because its text lives on at the new path, and Git shall keep the history because it detects the rename from the identical text. The kernel shall refuse a rename, and change nothing, when the old file doesn't exist or is marked for deletion, or when the new path already exists, in the store or as an unsaved new file. Undoing a rename after it was saved shall give back the old path, with the old text in the files that were rewritten. That undo deletes the new file through the trash, because it is a plain delete. A saved delete of the old path goes to the trash unless the same save writes the text the rename gave the new path.

## Examples

- Given a saved file `a.yaml` and a file `b.yaml` that names it,
  when the user renames `a.yaml` to `c.yaml` with a rewrite of `b.yaml`,
  then `c.yaml` holds the old text, `a.yaml` is marked for deletion, `b.yaml` holds the rewrite, and one undo restores all three.
- Given a workspace with a trash,
  when a rename is saved,
  then the old file is gone and the trash holds nothing.
- Given `c.yaml` already exists,
  when the user renames `a.yaml` to `c.yaml`,
  then the rename is refused and nothing changed.
- Given a rename that was saved,
  when the user undoes it and saves,
  then `a.yaml` is back with its old text, `c.yaml` is gone and `b.yaml` names `a.yaml` again.
