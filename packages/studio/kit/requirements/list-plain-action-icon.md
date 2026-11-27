# kit.list-plain-action-icon

- Status: active
- Since: unreleased
- Source: the read and unread rule approved by the board on HAL-19192 (26 Nov), Sofia's sketch D there (on hover the time gives way to the action); Sofia's re-check of #6764 on HAL-20395 (27 Nov: the action as a small icon button in the time's place, its name in its label and tooltip); task HAL-20396

When a `plain` List's row has a `hoverAction` with an `icon`, the List shall draw the action as a 24px icon button at the top right of the row, where its time is, in place of its words, and shall show and hide it as it does a `hoverAction` with words (`kit.list-plain-action`). Its name shall be its `spokenLabel`, or its label without one, and its label shall be its tooltip. The button shall take no width from the row's text, so the title and the meta line run up to the trailing part as on a row without an action.

## Examples

- Given a plain List whose row "Approve the release notes" has the hover action "Mark as read" with a tick icon and the spoken label "Mark as read: release notes",
  when the row renders,
  then its action is an icon button named "Mark as read: release notes" with no words of its own, and its tooltip says "Mark as read".
- Given that row,
  when focus is on the row and the user presses →,
  then focus is on the icon button, and Enter on it calls it without opening the row.
