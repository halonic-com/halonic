# inbox.plain-rows

- Status: active
- Since: unreleased
- Source: the Inbox and Messenger layout approved by the board on HAL-19192 (26 Nov), Sofia's sketches of 07:58 and 09:08 there: plain rows like the Messenger's chat list; Julian's review of HAL-19492 (Done too); built on HAL-19492

The Inbox shall draw Needs you, and the Done list under it, as the kit's plain List (`kit.list-plain`), the Messenger's row look: no box or lines between the rows, each row rounded, a soft fill on hover and on the open item's row, and no accent bar. Needs you and Done shall each stay one grid, so the arrows move between its rows and Enter opens one, as before.

## Examples

- Given an approval and a person step in Needs you,
  when the Inbox shows them,
  then neither row has a line or a box round it, and both rows are rounded.
- Given the person step is open,
  when the Inbox shows Needs you,
  then its row has the soft fill and `aria-current`, and no accent bar.
- Given a done proposal is open,
  when the Inbox shows Done,
  then its row is rounded, has the soft fill and `aria-current`, and no line or accent bar.
