# kit.list-plain

- Status: active
- Since: unreleased
- Source: the Inbox and Messenger layout and the read and unread rule approved by the board on HAL-19192 (26 Nov), Sofia's sketches of 07:58 and 09:08 there: the Inbox's Needs you in the Messenger's plain rows; Julian's review of HAL-19492 (dots in forced colours); built on HAL-19492

When a `List` is `plain`, it shall draw its rows without a box or lines between them, each row rounded and 4px from the next, with a regular-weight title, a muted fill on hover and on the current row, and no accent bar; the current row shall keep `aria-current` and stay one cell of the grid, so the arrows and Enter work as in any List. While a plain List's row is unread, its title shall be semibold, its meta line full colour, and `PlainRow`'s blue dot, or count, shall show at the end of its meta line with its words for screen readers. The blue unread dot and count, and the violet flag dot, of a plain List and of a `PlainRow` shall stay visible in forced colours, drawn in `CanvasText`.

## Examples

- Given a plain List whose second row is current,
  when it renders,
  then no row has a line or a box, every row is rounded, the current row has the muted fill and `aria-current`, and no row has the accent bar.
- Given a plain List with an unread row read out as "unread" and a read row,
  when it renders,
  then the unread row's title is semibold, its meta line full colour and a blue dot ends it, and the read row's title is regular weight and its line muted with no dot.
- Given a `PlainRow` with a flag and an unread count,
  when forced colours are on,
  then the flag dot and the count are drawn in `CanvasText`.
