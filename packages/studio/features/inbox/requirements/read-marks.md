# inbox.read-marks

- Status: active
- Since: unreleased
- Source: the read and unread rule approved by the board on HAL-19192 (26 Nov), Sofia's sketches of 07:58 and 09:08 there; the plan approved by Liam on HAL-19492 (26 Nov, 09:12 UTC); built on HAL-19492

The Inbox shall keep on the device which of its items the person opened. While an item in Needs you hasn't been opened, its row shall be unread (`kit.list-plain`): a semibold title, a full-colour line and a blue dot, with "unread" after its name for a screen reader. Opening an item shall mark it read: its row gets a regular title and a muted line, and it stays in Needs you while it waits. A bundle of an agent's cards shall be unread while any of its cards is, and opening it shall mark each of them read. The Needs you heading shall say how many of the items that wait are new, after how many wait and before how many are late: "8 waiting · 3 new · 1 late", heard "Needs you, 8 waiting, 3 new, 1 late", and never "0 new". While the open item waits, its header shall end with a ··· button named "More actions for" and the item's title, whose menu holds "Mark as unread"; choosing it shall mark the item (a bundle's newest card) unread, close it and put focus on its row. The device shall keep the newest 1,000 marks at most, and each change of a mark shall leave the marks another Studio window kept in the meantime as they are.

## Examples

- Given two approvals nobody opened,
  when you open the Inbox,
  then both rows show the blue dot and the heading reads "2 waiting · 2 new".
- Given the same two approvals,
  when you open the first and go back to the list,
  then its row has no dot, it is still in Needs you, and the heading reads "2 waiting · 1 new".
- Given the first approval open,
  when you pick "Mark as unread" in the header's ··· menu,
  then the approval closes, focus is on its row, and the row shows the blue dot again.
- Given a bundle of two cards from Chief, one of them opened before,
  when you open the Inbox,
  then the bundle's row shows the blue dot, and opening it marks both cards read.
- Given an approval you opened,
  when Studio starts again,
  then its row has no dot.
