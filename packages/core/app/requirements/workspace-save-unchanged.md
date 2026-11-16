# app.workspace-save-unchanged

- Status: active
- Since: 0.1.0
- Source: HAL-1293, save model 1.7

When the kernel saves a file, it shall write or delete it only if the file still holds the text Halonic last read or wrote, or still does not exist when Halonic read no file. If the file changed outside Halonic, then nothing shall be written to that file and its changes shall stay unsaved, and the save shall write the other files and then end with a `ChangedOnDiskError` that lists every file it held with its text now. A save shall work again once Halonic has read the file again or has written it itself.

## Examples

- Given Halonic read `a.yaml` and another program then changed it,
  when the user saves an edit of `a.yaml`,
  then the save fails with `ChangedOnDiskError`, `a.yaml` keeps the other program's text and the edit stays unsaved.
- Given Halonic read `a.yaml`, another program changed it, and the user edited `a.yaml` and `b.yaml`,
  when the user saves,
  then `b.yaml` is written, and the save fails with a `ChangedOnDiskError` that lists `a.yaml` only.
- Given Halonic read `a.yaml` and another program then changed it,
  when the user saves a delete of `a.yaml`,
  then the file is not deleted.
- Given Halonic read that `n.yaml` does not exist and another program then created it,
  when the user saves a new `n.yaml`,
  then the other program's file is kept.
- Given a file Halonic saved itself,
  when the user edits and saves it again,
  then the second save is written.
