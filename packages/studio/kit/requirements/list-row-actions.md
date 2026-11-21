# kit.list-row-actions

- Status: active
- Since: unreleased
- Source: HAL-13410; first-run-progress (HAL-7986) 3.1, a setup row's waiting and problem states, approved by the board on 19 Nov (HAL-7993)

When a row of the kit's `List` without `columns` has `under`, the List shall draw it in the row's text column, under the meta line. When a row has `actions`, the List shall draw them as text buttons in `accent-text` under the meta line and `under`, in the given order, wrapping onto another line when they don't fit, and each shall be a cell of the List's grid after the main cell and before the More button: → from the main cell shall reach the first action, ← shall go back, and the List shall stay one Tab stop. A row with fewer actions than another shall leave those columns empty, so its More button keeps its column. Enter, Space or a click on an action shall call its `onClick` and shall not open the row.

## Examples

- Given a row "Connect a model" with the actions Check again and Open Models,
  when focus is on the row and the user presses → twice,
  then focus is on Open Models, and Enter there calls its `onClick` and not the List's `onOpen`.
- Given that row,
  when the user clicks Check again,
  then its `onClick` is called once and the List's `onOpen` isn't.
- Given a row with `under` holding a WaitingLine,
  when it renders,
  then the line sits under the row's meta line, inside the row.
- Given one row with two actions and a More button, and another row with only a More button,
  when focus is on the second row's More button and the user presses ↑,
  then focus moves to the first row's More button.
