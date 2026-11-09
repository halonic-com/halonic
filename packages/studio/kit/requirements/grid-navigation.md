# kit.grid-navigation

- Status: active
- Since: 0.1.0
- Source: HAL-1289; base component specs 23.3 L3 and 23 A2

The kit's `useGridNavigation` shall keep exactly one focusable cell of a grid in the Tab order, the first focusable cell at the start. When the user presses the up or down arrow key on a cell, it shall move focus to the next or previous row that has a focusable cell, in the same column or the nearest focusable column to its left; the left and right arrow keys shall move between a row's focusable cells without wrapping; Home and End shall move to the first and last such row. Rows without focusable cells, such as section headings, and empty cells shall be passed over. It shall leave alone keys pressed with Alt or Meta, while an input method is composing, or from an element inside a cell. When the row that had focus is removed, it shall move focus to the row that took its place, else to the nearest row before it.

## Examples

- Given a heading row, a row of three cells and a row whose middle cell is empty, with focus on the first row's middle cell,
  when the user presses the down arrow key,
  then focus is on the second row's first cell.
