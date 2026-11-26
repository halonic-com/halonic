# quick-ask.messenger

- Status: active
- Since: unreleased
- Source: HAL-19089, design check HAL-19068 (board's approval of the HAL-18594 design, sections 4, 5 and 7)

When the quick-ask box shows an answer, its footer shall offer **Open in Messenger** next to
**Copy**. When the answer holds a card, the box shall offer **Answer in Messenger** under the card's
question. When an answer came after the box closed, the hint row shall end with "Last answer:
{agent}, {time} ›", the time as the Studio's clock time. Each of the three shall fade the box out
and ask its window to open the chat in Messenger, through `plugin:quick-ask|open_chat` on the
desktop; **Last answer ›** shall also forget that answer, so the next opening doesn't offer it
again.

## Examples

- Given Chief answered the question in the box,
  when the person presses Open in Messenger,
  then the box fades out and Messenger opens on the chat with Chief.
- Given Chief's answer holds the card "Ship 0.2.0 today?",
  then the box says "Chief asks you to choose", "Ship 0.2.0 today?" and offers Answer in Messenger.
- Given Liam answered at 13:41 today, after the box closed,
  when the box opens,
  then the hint row ends with "Last answer: Liam, 13:41 ›".
