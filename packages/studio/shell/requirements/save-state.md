# shell.save-state

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); save model 1.2, 1.4 and 6.3 (HAL-1102); microcopy 2 and 22 F9 (HAL-751); UX checklist part 1, 1.1 (HAL-1323)

The shell shall keep one save note per workspace, for the toolbar, saying one of: saved, saving, fields not saved with their count, items not saved with their count and the item held back longest, or failed. When a save of any item has failed and not been saved since, the note shall be failed. Otherwise, while a change from outside Halonic holds back items with the user's changes, the note shall be items not saved. Otherwise, while fields have a mistake, the note shall be fields not saved, counting them over every item. Otherwise, while a write runs, the note shall be saving; otherwise saved. When a write fails, the shell shall show a danger toast "Couldn't save <item>: <reason>." with **Try again**, where the reason is "the disk is full", "Halonic can't write to this folder" or "another app is using the file", and a failure with no reason of its own reads "Couldn't save <item>."; Try again, on the toast or for the note, shall run the same write again. When writes of one item overlap, only the newest write's failure shall count, so Try again never writes older content over a newer save. When an item saves again, the shell shall close its failure toast. Compare shall open Compare for the item held back longest. The shell shall tell listeners only when the note changes.

## Examples

- Given a workflow "Support reply" being written,
  then the note is saving; when the write is done, it is saved.
- Given a write of "Support reply" that fails with `ENOSPC`,
  then the note is failed and a danger toast reads "Couldn't save Support reply: the disk is full." with Try again.
- Given that failure,
  when the user presses Try again and the write succeeds,
  then the note is saved and the toast is gone.
- Given one field with a mistake in "Support reply" and two in "Sorter",
  then the note is fields not saved, 3.
- Given "Sorter" held back by a change from outside Halonic,
  then the note is items not saved, 1, with "Sorter" first, and Compare opens Sorter's Compare.
- Given an older write of "Support reply" that fails after a newer write of it started,
  when the newer write succeeds,
  then the note is saved and no toast shows.
