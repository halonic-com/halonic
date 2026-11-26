# kit.list-plain-action

- Status: active
- Since: unreleased
- Source: the read and unread rule approved by the board on HAL-19192 (26 Nov), Sofia's sketch D of 07:58 there (on hover the time gives way to Mark as unread or Mark as read; the dot under the time) her design-check nit on HAL-20008 (the dot under the end chip) and her design check on HAL-20148 (the action only with the row's fill; the chip on the title line, the dot on the meta line); Sofia's acceptance row A2.3 on HAL-20100; built on HAL-19492

When a `plain` List's row has a `hoverAction`, the List shall show its button at the end of the row's first line, over the trailing part and on the row's hover fill, while the pointer is on the row or the row has keyboard focus, with the row's hover fill, and shall hide it otherwise, when it takes no clicks. The button shall sit in a cell of its own, so its words stay out of the row's text and name, and that cell shall be a cell of the List's grid after the row's `actions`: → from the row shall reach it, ← shall go back, and the List shall stay one Tab stop. Enter, Space or a click on it shall call its `onClick` and shall not open the row. Its name shall be its `spokenLabel`, or its label without one. While a plain List's row is unread and has a trailing part, the part shall sit on the title's first line and the unread mark under it, on the meta line, so the marks line up in one column; while the row's action shows, the part shall be hidden under it.

## Examples

- Given a plain List whose row "Approve the release notes" has the hover action "Mark as unread",
  when focus is on the row and the user presses →,
  then focus is on "Mark as unread", and Enter on it calls it without opening the row.
- Given that row,
  when the pointer isn't on it and it doesn't have focus,
  then its action is hidden and takes no clicks.
- Given an unread plain row with the chip "Late",
  when it renders,
  then its blue dot sits under the chip, on the meta line, and the chip on the title's first line.
