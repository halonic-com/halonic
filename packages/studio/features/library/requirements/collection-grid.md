# library.collection-grid

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (T10, P7b4); flow-library 5.3; accessibility pass 9.3

When a cell of the collection page's grid has focus, a typed character shall open the cell's editor with that character in place of the value, Delete and Backspace shall empty the cell, and Home, End, Ctrl Home, Ctrl End, Page Up and Page Down shall move between cells. Shift F10 shall open the row's menu. In an editor, Enter shall save the value and go to the cell below, and Tab shall save it and go to the next cell, or leave the grid from the last one. A cell that holds a message shall have a danger ring. After a record is added the page shall say "Added" and its id and put focus in the new row's first cell. After a record is removed the page shall say "Removed" and its id and put focus in the same column of the row that took its place. With no records the page shall say "No records yet." with **Add record**, which opens the new row; for a chosen view with none it shall say "No records in" the view's name.

## Examples

- Given "7" typed on the amount cell, then its editor opens with "7" in it.
- Given Delete on the amount cell, then the host changes `amount` to null.
- Given Delete on a cell of the new row, then only what was typed there is emptied.
- Given Page Down on the first row of 25, then focus is in the same column ten rows down.
- Given Tab in an editor, then the value is saved and focus is on the next cell.
- Given Tab in the last cell of the new row, then the value is kept and Tab goes on out of the grid.
- Given a value the field doesn't accept, then its cell has the danger ring.
- Given a record added, then the page says "Added" and its id, and focus is in the new row's first cell.
- Given a record removed, then the page says "Removed" and its id.
- Given no records, then the page says "No records yet." with **Add record**.
- Given a view with no records, then the page says "No records in" its name and has no **Add record**.
