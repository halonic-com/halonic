# assistant.start-screen.centered-input

- Status: active
- Since: unreleased
- Source: HAL-16803 (T14 PR 12); flow-assistant 6.1 (HAL-647); states H1 (HAL-5896); microcopy 14.1 (HAL-751)

While a chat in a tab has no messages, the tab shall show the start screen: the heading "What should we build?", the line "I make changes in your files and mark them; you accept or reject each one.", and the message box under them in the middle of the tab, at most the reading column wide, with focus in the box. When the first message is sent, the heading and the line shall go, the box shall move to the bottom of the chat column with focus still in it, and the transcript shall start above it, with no glide.

## Examples

- Given a new chat opened as a tab,
  then it shows "What should we build?" and the box in the middle, with focus in the box.
- Given that start screen,
  when the person sends "Add a routine",
  then the heading is gone, the message is in the transcript, and focus is in the box at the bottom.
