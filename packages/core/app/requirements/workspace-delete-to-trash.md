# app.workspace-delete-to-trash

- Status: active
- Since: unreleased
- Source: HAL-1293, save model 4.2

When the kernel saves the delete of a file and the workspace has a trash, the kernel shall move the file into the trash instead of removing it, so its text is kept. If the file changed outside Halonic, then the file shall stay where it is and the save shall hold it with a `ChangedOnDiskError`. Where the workspace has no trash, the save shall remove the file.

## Examples

- Given a workspace with a trash and a file Halonic read,
  when the user deletes the file and it is saved,
  then the file is gone from the workspace and the trash holds its path and text.
- Given the file changed outside Halonic after Halonic read it,
  when the user saves its delete,
  then the file keeps the other program's text and the trash holds nothing.
- Given a delete that was saved,
  when the user undoes it and the file is saved again,
  then the file holds its old text again.
