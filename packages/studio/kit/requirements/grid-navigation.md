# kit.grid-navigation

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 23.3 L3 and 23 A2; HAL-1639 (kit T1 design check 3, F29 and C23); HAL-1995 (C21)

The kit's `useGridNavigation` shall keep exactly one focusable cell of a grid in the Tab order, the first row's cell in its `startColumn` (default the first column), or the nearest focusable one to its left, at the start. When the user presses the up or down arrow key on a cell, it shall move focus to the next or previous row that has a focusable cell, in the column the user last chose with the left or right arrow key or a click, or the nearest focusable column to its left, without changing that choice; the left and right arrow keys shall move between a row's focusable cells without wrapping; Home and End shall move to the first and last such row. Rows without focusable cells, such as section headings, and empty cells shall be passed over. It shall stop these keys from scrolling the page whenever they come from a cell, even where focus can't move. It shall leave alone keys pressed with Alt or Meta, while an input method is composing, or from an element inside a cell. When the row that had focus is removed, it shall move focus to the row that took its place, else to the nearest row before it.

## Examples

- Given a heading row, a row of three cells and a row whose middle cell is empty, with focus on the first row's middle cell,
  when the user presses the down arrow key,
  then focus is on the second row's first cell.
- Given rows with a name, a link and a × cell, the middle row without a ×, with focus on the first row's ×,
  when the user presses the down arrow key twice,
  then focus is on the middle row's link and then on the last row's ×.
