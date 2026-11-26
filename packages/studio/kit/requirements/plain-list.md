# kit.plain-list

- Status: active
- Since: unreleased
- Source: the Inbox and Messenger layout and the read and unread rule approved by the board on HAL-19192 (26 Nov), Sofia's sketches of 07:58 and 09:08 there; built on HAL-19492

The kit's `PlainList` shall show its rows without borders, each row a button with its picture, its title over one line and its time on the right, with a muted background on hover and on the current row, which is marked `aria-current`. While a row is unread, its title shall be semibold, its line full colour, and a blue count, or a blue dot without a count, shall show under the time, with words for screen readers in the row's name; while it is read, its title shall be regular weight, its line muted, and no count or dot shall show. A row's flag shall show as a 6px violet dot after the title, read out with its words. A row's action shall be a button of its own, shown in place of the time while the row is hovered or has focus; when given a spoken label, it shall be named by that label, which starts with the words it shows.

## Examples

- Given an unread row "Chief" with the count "2" and the words " unread",
  when the list renders,
  then the title is semibold, the line full colour, the count "2" shows, and the row's name holds "2 unread".
- Given a read row,
  when the list renders,
  then the title is regular, the line muted, and no count or dot shows.
- Given an unread row without a count, read out as "unread",
  when the list renders,
  then a blue dot shows and the row's name holds "unread".
- Given a row with the action "Mark as unread",
  when the person clicks the action,
  then the action runs and the row isn't selected.
- Given a row with the action "Mark as read" and the spoken label "Mark as read: Chief",
  when the list renders,
  then the action shows "Mark as read" and is named "Mark as read: Chief".
