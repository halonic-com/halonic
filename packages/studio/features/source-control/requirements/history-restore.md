# source-control.history-restore

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); HAL-12857 (a version's items, not its paths); ux-checklists-t8-t9 (HAL-1360) part 2, 2.9 and 2.14; design-source-control (HAL-552) 5.5

The What's in it of a version, in the desktop's details and on the phone's version page, shall list the items the version changed, grouped as the Changes list groups files, each row named as `source-control.history-page` says, with no path, and a ⋮ whose entry is **Restore just this**. When Restore just this is picked, the source control feature shall put each file of the item as that version has it, deleting a file the version doesn't have, so the item becomes an ordinary change, and shall show the toast "Restored *item* from "*version*"." with **Undo**, which puts the files back as they were. The source control feature shall keep a copy of what the files held before it writes them; when the copy can't be kept, nothing shall change. When a file changed while it was being restored, the files already restored shall be put back, and a danger toast shall say why; when putting them back fails too, a warning Callout shall say "Restored part of *item* from "*version*"." with the files not as they were and Try again, and focus shall move to it. While a merge of updates is started, Restore just this shall wait, with "Finish getting updates first." as its reason. The source control feature shall read a file in a version through the shell's `git show`, which is on the allow-list as it is.

Not covered yet: a workspace folder inside a larger repository (HAL-9756): History gives paths from the repository root, while files are read and written from the workspace folder. That can't happen today, because such a folder only shows the larger-repository note (HAL-9756); if Halonic ever keeps versions for it, the read shall use `<id>:./<path>` and paths relative to the folder.

## Examples

- Given a version that set Sorter's model, and Sorter changed since,
  then Restore just this on Sorter writes Sorter as that version has it, shows "Restored Sorter from "Sorter replies in Dutch"." with Undo, and Undo puts the newer Sorter back.
- Given an item whose file the version doesn't have,
  then Restore just this deletes that file.
- Given a copy that can't be kept,
  then no file changes and a danger toast says why.
- Given an item of two files, the second changed on disk while restoring,
  then the first is put back and a danger toast says a file changed.
- Given that and the first can't be put back either,
  then a warning Callout names the first file, with Try again.
- Given a started merge,
  then Restore just this is unavailable with "Finish getting updates first.".
