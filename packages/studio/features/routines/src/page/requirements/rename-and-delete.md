# routines.page.rename-and-delete

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 12); flow-routines 2.4; microcopy 12.3

The routine page's name shall be a rename field that keeps the new name on Enter or when the field is left and puts the old name back on Esc, and its ⋮ menu shall hold **Delete**, which deletes the routine at once with no dialog and a toast with **Undo**; when the name can't be saved, a toast shall say why.

## Examples

- Given the routine "Daily" is open, when the name is changed to "Morning" and Enter is pressed, then the host saves the name "Morning" and nothing else.
- Given the name was changed, when Esc is pressed, then the field shows "Daily" again and nothing is saved.
- Given the host can't save the name, then a toast says "Couldn't rename Daily." with the reason.
- Given ⋮ is pressed and **Delete** chosen, then the routine is deleted with no dialog, a toast says "Deleted Daily." with **Undo**, and the page says the routine isn't in the workspace any more.
- Given Undo is pressed, then the routine is back on the page.
- Given the window is a phone, then the header has no name field and ⋮ holds **Rename** above **Delete**; **Rename** opens a sheet with the name, an empty name is refused with "Give it a name.", and **Rename** saves the new name and closes the sheet.
