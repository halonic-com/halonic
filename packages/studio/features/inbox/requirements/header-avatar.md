# inbox.header-avatar

- Status: active
- Since: unreleased
- Source: the board's feedback on HAL-19536, item 3 (bigger avatars, especially in headers), plan approved by Liam on HAL-19539; the shared header of HAL-19192; built on HAL-19586 and HAL-19492; the list's rows grew to 60px pictures with the board's bigger sidebar rows (HAL-10, HAL-19735)

When an item is open, the Inbox shall show a header over its card, as the Messenger's chat header does: its row's picture at 40px, the item's title over its row's line, and, while it waits, where it is among what waits. For a bundle of an agent's cards, the header shall name what in it still waits. Once an item no longer waits (an agent's card answered, an approval or a person step decided, or its run moved on), the header's line shall drop the wait: an agent's card's line ends at who asks, and a run's item keeps its run. With one pane at a time, a back arrow named "Back to Inbox" shall lead the header. The card under the header shall keep who asks over the title, without a second picture. The list's rows shall keep their own 60px sidebar pictures (`kit.plain-row-size`).

## Examples

- Given a question from Chief, whose title is Chief of Staff,
  when you open it,
  then the header shows a 40px picture with "C" before the question's title,
  and the card under it starts with "Chief · Chief of Staff asks" and has no picture.
- Given an approval and a person step that wait,
  when you open the approval,
  then the header shows the stamp at 40px before its title, and "1 of 2" before its ··· button.
- Given the same question from Chief, open,
  when it is answered,
  then the header's line reads "Paperclip · Acme · Chief", with no "Waiting" and no place.
- Given a bundle of two cards from Chief, open,
  when you answer its first card,
  then the header names the second card, with its wait and "1 of 1".
- Given an approval that waits, open,
  when you approve it,
  then the header's line no longer says "Waiting", and it has no place.
- Given one pane at a time,
  when you open an item,
  then the header starts with a back arrow whose name is "Back to Inbox".
- Given the same question from Chief,
  when the list shows it,
  then its row's picture stays the sidebar's 60px.
