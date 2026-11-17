# routines.list.delete-with-undo

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 11); flow-routines 2.1, 2.4; microcopy 12.3; accessibility pass 10

When the user chooses **Delete** in a routine row's ⋮ menu, the Routines list shall move the routine to the trash at once with no dialog, say so in a toast with **Undo** and a second line about what it stops, move focus to the next row, and, when Undo puts it back, focus its row again; when the routine can't be moved or put back, the list shall say why in a toast.

## Examples

- Given the row "Daily" starts Briefing, when the user chooses Delete in its ⋮ menu, then no dialog opens, the host trashes "Daily" and a toast says "Moved Daily to the trash." with the line "It won't start Briefing any more. Runs it already started keep going." and **Undo**.
- Given Daily was deleted, when the user chooses Undo, then the host puts it back and its row shows again with the focus on it.
- Given the rows "Daily" and "Weekly report", when Daily is deleted, then the focus moves to "Weekly report"; given it was the only routine, the page's heading takes the focus.
- Given the host can't move the routine, then a toast that stays says "Couldn't move Daily to the trash: " and the host's reason, with **Try again**; a system message is never shown.
- Given the workspace changed after the delete, when the user chooses Undo, then a toast says "Couldn't put Daily back" and the reason.
- Given a row's ⋮ menu, then it lists Open, Open in new tab and Delete, with Delete last and in the danger style.
