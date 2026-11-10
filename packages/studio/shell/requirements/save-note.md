# shell.save-note

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); save model 1.4 and 6.3 (HAL-1102); microcopy 1.1 and 2 (HAL-751); UX checklist part 1, 1.1 (HAL-1323); UX and design checks of the save state (HAL-3838)

The shell shall show the workspace's save note in the toolbar, worded from its save state. Saved shall read "✓ Saved" and be named "All changes saved". Saving shall read "Saving…", with the ellipsis character, and shall show only once a write has run for 300 ms; until then the note shown before stays. Fields not saved shall read "<n> field(s) not saved" and items not saved "<n> item(s) not saved" with **Compare**, both after a warning mark. Failed shall read "Couldn't save <item>" when one item failed and "Couldn't save <n> items" when several did, with **Try again**, after a danger mark. A problem's words shall stop at 240 px and end in "…", so a long item title keeps **Try again** in view; a screen reader still reads the whole title. The warning and danger marks shall be named "Warning" and "Error", so they don't rest on colour alone. Try again shall run every failed write again, and Compare shall open the item held back longest. The note shall not be a live region. The shell shall read the note out politely once each time it becomes items not saved, and never when it becomes failed, saving, saved or fields not saved. Failed is read by its danger toast, an alert, so the note doesn't say it a second time.

## Examples

- Given nothing being written,
  then the note shows "✓ Saved" and a screen reader reads "All changes saved".
- Given a write of "Support reply" that finishes after 100 ms,
  then the note shows "✓ Saved" all along.
- Given a write of "Support reply" that runs for 300 ms,
  then the note shows "Saving…".
- Given a write of "Support reply" that fails,
  then the note reads "Couldn't save Support reply · Try again" and the note reads nothing out; the toast's alert reads the failure.
- Given failed writes of "Support reply" and "Sorter",
  then the note reads "Couldn't save 2 items · Try again".
- Given a failed write of an item with a title too long for 240 px,
  then the note shows the start of the title ending in "…" and **Try again** stays in view.
- Given two fields with a mistake,
  then the note reads "2 fields not saved" after a mark named "Warning", and nothing is read out.
- Given "Sorter" held back by a change from outside Halonic,
  then the note reads "1 item not saved · Compare" and "1 item not saved." is read out once.
