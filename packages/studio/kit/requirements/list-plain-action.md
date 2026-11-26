# kit.list-plain-action

- Status: active
- Since: unreleased
- Source: the read and unread rule approved by the board on HAL-19192 (26 Nov), Sofia's sketch D of 07:58 there (on hover the time gives way to Mark as unread or Mark as read; the dot under the time) and her design-check nit on HAL-20008 (the dot under the end chip); Sofia's acceptance row A2.3 on HAL-20100; built on HAL-19492

When a `plain` List's row has a `hoverAction`, the List shall show its button at the end of the row's first line, over the trailing part and on the row's hover fill, while the pointer is on the row or the row has focus, and shall hide it otherwise, when it takes no clicks. The button shall sit in a cell of its own, so its words stay out of the row's text and name, and that cell shall be a cell of the List's grid after the row's `actions`: → from the row shall reach it, ← shall go back, and the List shall stay one Tab stop. Enter, Space or a click on it shall call its `onClick` and shall not open the row. Its name shall be its `spokenLabel`, or its label without one. While a plain List's row is unread and has a trailing part, its unread mark shall sit under that part, at the end of the meta line, so the marks line up in one column.

## Examples

- Given a plain List whose row "Approve the release notes" has the hover action "Mark as unread",
  when focus is on the row and the user presses →,
  then focus is on "Mark as unread", and Enter on it calls it without opening the row.
- Given that row,
  when the pointer isn't on it and it doesn't have focus,
  then its action is hidden and takes no clicks.
- Given an unread plain row with the chip "Late",
  when it renders,
  then its blue dot sits under the chip, not beside the meta line.
