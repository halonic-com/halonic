# routines.page.rename-and-delete

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 12); flow-routines 2.4; microcopy 12.3

The routine page's name shall be a rename field that keeps the new name on Enter or when the field is left and puts the old name back on Esc, and its ⋮ menu shall hold **Delete**, which deletes the routine at once with no dialog; the page shall then say "This routine was deleted." with what deleting stops and **Undo**, which takes the focus, for as long as the page is open (HAL-14241); when the name can't be saved, a toast shall say why.

## Examples

- Given the routine "Daily" is open, when the name is changed to "Morning" and Enter is pressed, then the host saves the name "Morning" and nothing else.
- Given the name was changed, when Esc is pressed, then the field shows "Daily" again and nothing is saved.
- Given the host can't save the name, then a toast says "Couldn't rename Daily." with the reason.
- Given ⋮ is pressed and **Delete** chosen, then the routine is deleted with no dialog and no toast, and the page says "This routine was deleted." and "It won't start Briefing any more. Runs it already started keep going." with **Undo**, which has the focus.
- Given Undo is pressed, then the routine is back on the page and its name has the focus.
- Given a routine that was deleted somewhere else, then the page says the routine isn't in the workspace any more.
- Given the window is a phone, then the header has no name field and ⋮ holds **Rename** above **Delete**; **Rename** opens a sheet with the name, an empty name is refused with "Give it a name.", and **Rename** saves the new name and closes the sheet.
