# remote.phone-reactions

- Status: draft
- Since: unreleased
- Source: HAL-20426 (follow-up of HAL-19139; the board approved the proposal there on 26 Nov; Sofia's sketch, section 4, and her acceptance rows A2.1–A2.7 and A3.2 on HAL-20245)

While the computer keeps reactions (gateway version 5 and on), the phone's chat (`remote.phone-messenger`) shall show the reactions under every message, old ones included, as 32 px chips: one per emoji, in the set's order (👍 ❤️ 😂 😮 ✅ 👀), with its count, the person's own in the accent colour and pressed, an agent's like anyone else's. A screen reader shall hear a chip as "Thumbs up, 2: you and Chief". Tapping a chip shall add the person's own reaction, or take it off, at once and without opening anything. When a finger rests on a message for about half a second without moving, the phone shall open a sheet with the caption "React to your message" or "React to <name>'s message", the message's text, the six emoji at 48 px across the full width, and "Copy text"; a finger that moves, and a mouse, shall open nothing. Tapping an emoji in the sheet shall react and close it; "Copy text" shall put the message's text on the clipboard and close it, or say "Couldn't copy the text." when the clipboard refuses. If saving a reaction fails, only that emoji shall go back, and the line under the box shall say "Couldn't save the reaction. Try again." While the computer speaks version 4 or older, or its source keeps no reactions, the chat shall show its messages as before, with no chips, no sheet and no error.

## Examples

- Given the person reacted 👍 to Elena's message from yesterday on the computer, and Liam 👀,
  when the person opens the chat on the phone,
  then "👍 1" shows under it, pressed, and "👀 1", not pressed.
- Given the same chat,
  when the person rests a finger on Elena's message for half a second,
  then the sheet "React to Elena's message" opens with the six emoji and "Copy text".
- Given the sheet is open,
  when the person taps "Heart",
  then the sheet closes and "❤️ 1" shows under the message at once.
- Given a finger that moves 20 px while on a message,
  when half a second passes,
  then no sheet opens.
- Given a computer that speaks version 4,
  when the person opens a chat,
  then its messages show, with no chips.
