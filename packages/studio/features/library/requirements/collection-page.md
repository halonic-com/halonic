# library.collection-page

- Status: active
- Since: unreleased
- Source: HAL-1303 (T10, P7); HAL-13651; C403 CP1 (HAL-14489); flow-library 5.3; `library.collections.edit-cell`, `library.collections.add-row-when-ready`, `library.collections.views-with-totals`, `library.collections.works-on-desktop` (HAL-119); a11y checks L5 and L7 (HAL-14203)

When a collection opens, its page shall show a chip for "All" and one per view with the record count and, where the view has a total, the total, lined up with the title and the grid, and show only the chosen chip's records in a grid with one column per field in file order. A header shall carry `*` for a required field and `ƒ` for a computed one. When a cell is left, the page shall save the typed value as one change through the collection host, an emptied cell saves `null`, a computed cell opens no editor, and an unchanged value writes nothing. If the field doesn't accept the value, then the page shall write nothing and show the core message under the cell until the cell's next edit. The last row is the new row: each of its empty cells is named "New record" for a screen reader and is as high as a row with text, it shows each default as a "default" tag, the hint under the grid says "Fill the last row to add a record: still needed amount." with the required fields still empty, and when every required field is filled the page shall add the record through the host and empty the row. A record is named by its first field's text, never by its generated id, and as "this record" when that is empty: its menu button is "More actions for Swim lesson", and the menu has **Remove**, which asks "Remove Swim lesson?" with **Remove** and **Cancel** and then removes the record through the host. A screen reader hears "Added Trip." or "Removed Swim lesson." after a record is added or removed ("Added a record." or "Removed a record." without a name). If an edit finds its row removed, then the page shall say "Row removed by another change." and keep every other cell. The header shall show the name as a rename field named "Name": when a different name is kept, the page shall rename the collection through the host, and if that fails, then the page shall say "Couldn't rename the collection." Where the page is under a phone's top bar, which already names the collection, the page shall keep its title for screen readers only and draw no title row, and its ⋮ shall start with **Rename**, before **Open as file** and **Delete**, which opens the shell's rename sheet and renames the collection the same way. Under the grid the page shall show "Used by" with the agents that use the collection, or "No agent uses this collection yet." when none does. When the records are kept only while Studio is open, the page shall say "Records are kept only while this Studio is open." above the grid. If the host has no such collection, then the page shall say "This collection isn't in this workspace any more." with **Go to Library**.

## Examples

- Given a view `open` with `total: share` and one open record, then the chips read "All (1)" and "open (1) · 45,00".
- Given the chip `open` is chosen, then only its records are in the grid.
- Given "65" typed into the amount cell of `swim-oct`, when the cell is left, then the host changes `amount` to 65 once.
- Given "lots" typed into a money cell, then nothing is written and the cell shows the core message.
- Given "Claims 2024" kept in the name field, then the host renames the collection to "Claims 2024" once.
- Given the name field left unchanged, then the host renames nothing.
- Given a phone and the page under its top bar, then the name is on screen once, in the top bar, and ⋮ reads Rename, Open as file, Delete.
- Given a phone and **Rename** pressed in the sheet with an empty name, then it says "Give it a name." and the host renames nothing.
- Given a phone and **Rename** pressed in the sheet with the same name, then the sheet closes and the host renames nothing.
- Given a phone and "Claims 2024" kept in the sheet, then the host renames the collection to "Claims 2024" once.
- Given a computed column, then its cells open no editor.
- Given the new row with only `what` filled, then the hint says "Fill the last row to add a record: still needed amount."
- Given the new row with every required field filled, then the host adds the record and the row is empty again.
- Given **Remove** confirmed for `swim-oct`, then the host removes it.
- Given a record "Swim lesson" with the id `swim-oct`, then its menu is "More actions for Swim lesson" and Remove asks "Remove Swim lesson?".
- Given a record whose first field is empty, then its menu is "More actions for this record" and Remove asks "Remove this record?".
- Given an edit of a row another change removed, then the page says "Row removed by another change."
- Given a collection nobody uses, then "Used by" says "No agent uses this collection yet."
- Given a collection the host doesn't have, then the page says "This collection isn't in this workspace any more."
