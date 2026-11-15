# library.collection-page

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (T10, P7); flow-library 5.3; `library.collections.edit-cell`, `library.collections.add-row-when-ready`, `library.collections.views-with-totals`, `library.collections.works-on-desktop` (HAL-119)

When a collection opens, its page shall show a chip for "All" and one per view with the record count and, where the view has a total, the total, and show only the chosen chip's records in a grid with one column per field in file order. A header shall carry `*` for a required field and `ƒ` for a computed one. When a cell is left, the page shall save the typed value as one change through the collection host, an emptied cell saves `null`, a computed cell opens no editor, and an unchanged value writes nothing. If the field doesn't accept the value, then the page shall write nothing and show the core message under the cell until the cell's next edit. The last row is the new row: it shows each default as a "default" tag, the hint under the grid says "Fill the last row to add a record: still needed amount." with the required fields still empty, and when every required field is filled the page shall add the record through the host and empty the row. A row's menu has **Remove**, which asks "Remove swim-oct?" with **Remove** and **Cancel** and then removes the record through the host. If an edit finds its row removed, then the page shall say "Row removed by another change." and keep every other cell. Under the grid the page shall show "Used by" with the agents that use the collection, or "No agent uses this collection yet." when none does. When the records are kept only while Studio is open, the page shall say "Records are kept only while this Studio is open." above the grid. If the host has no such collection, then the page shall say "This collection isn't in this workspace any more." with **Go to Library**.

## Examples

- Given a view `open` with `total: share` and one open record, then the chips read "All (1)" and "open (1) · 45,00".
- Given the chip `open` is chosen, then only its records are in the grid.
- Given "65" typed into the amount cell of `swim-oct`, when the cell is left, then the host changes `amount` to 65 once.
- Given "lots" typed into a money cell, then nothing is written and the cell shows the core message.
- Given a computed column, then its cells open no editor.
- Given the new row with only `what` filled, then the hint says "Fill the last row to add a record: still needed amount."
- Given the new row with every required field filled, then the host adds the record and the row is empty again.
- Given **Remove** confirmed for `swim-oct`, then the host removes it.
- Given an edit of a row another change removed, then the page says "Row removed by another change."
- Given a collection nobody uses, then "Used by" says "No agent uses this collection yet."
- Given a collection the host doesn't have, then the page says "This collection isn't in this workspace any more."
