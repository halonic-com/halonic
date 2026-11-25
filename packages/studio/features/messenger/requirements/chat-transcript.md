# messenger.chat-transcript

- Status: active
- Since: unreleased
- Source: design review HAL-18481 (improvements 1 to 3, motions 1, 3, 4 and 5, flow 5.2), approved by the board on HAL-10 (25 Nov, 13:28 UTC), with the board's 800 px column (HAL-10, 25 Nov, 13:30 UTC); HAL-18556.

The Messenger shall show an open conversation's messages, the person's in bubbles on the end side, each with its time under it. It shall show an agent's messages in runs: the first message of a run, and in a channel every message that isn't the person's (`messenger.author-from-source`), under the agent's picture and "Name · 13:58". It shall show "Today", "Yesterday" or the day, such as "Mon 23 Nov", before each day's first entry. Its messages, cards, cards bar and box shall sit in one column at most 800 px wide in the middle of the pane.

When the person sends a message, the conversation shall show it at once with "Sending…" under it, and its time once it was sent; when the source refuses it, the message shall go back into the box. While the person is at the newest entry, within 24 px, the conversation shall stay there as entries come; while the person has scrolled up, it shall not move, and shall show "1 new message ↓", or "2 new messages ↓", which brings the person to the newest entry. While the first read of its messages is on its way, it shall show the kit's chat loading lines; when that read fails, it shall say "Couldn't load this chat" with **Try again**. The bar of `messenger.inline-cards` shall offer **Next**, which puts focus on the open card after the one in focus, and the first again after the last.

## Examples

- Given Chief wrote "Morning" at 9:00 and "Build is green" at 9:01 today, and the board answered "Thanks" at 9:05,
  when the board opens the chat,
  then it shows "Today", "Chief · 09:00" above both of Chief's messages, and "Thanks" in a bubble with "09:05".
- Given the same chat,
  when the board sends "On it",
  then "On it" shows at once with "Sending…", and with its time once it was sent.
- Given the board scrolled up in the chat,
  when Chief writes,
  then the chat stays where it is and shows "1 new message ↓".
- Given the chat's read fails,
  when the board opens it,
  then it says "Couldn't load this chat" with **Try again**.
- Given a window 1600 px wide,
  when the board opens a chat,
  then its messages and box are 800 px wide and centred; in a narrower pane they fill it.
- Given two open cards,
  when the board presses **Next** twice,
  then focus moves to the first card's first option, then the second's.
