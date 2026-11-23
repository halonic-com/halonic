# assistant.chat.first-load

- Status: active
- Since: unreleased
- Source: HAL-16795 (T14 PR 6a); states H1, H3, H7 and H8 with D3 (HAL-5896); flow-assistant 6.1 and 7 (HAL-647); microcopy 14.1 (HAL-751)

When the Assistant panel shows a chat it hasn't shown in this session, the panel shall show its header and box at once, and in the transcript's place nothing for 300 ms, then three still skeleton lines with the screen-reader label "Loading this chat", and after 10 seconds "Still loading" with **Try again**. When the panel shows a chat it has shown before in this session, it shall show it at once, where it got to, without reading it again. When a chat can't be read, the panel shall show "Couldn't load this chat" with the reason and **Try again**. When the chat to show is gone, the panel shall show "No chat open" with "Ask the assistant for a change. It makes it in your files and marks it; you accept or reject each one." and **New chat**. A chat with no message shall show "What should we build?" with "I make changes in your files and mark them; you accept or reject each one." at the top of the transcript.

## Examples

- Given the panel opens on a chat it hasn't shown yet, when 300 ms pass before it is read,
  then three skeleton lines show, named "Loading this chat".
- Given the panel showed "Add a routine", closed, and opens again,
  then "Add a routine" shows at once and the host isn't asked for it again.
- Given reading the chat fails with "The engine isn't answering.",
  then the panel shows "Couldn't load this chat · The engine isn't answering." with Try again.
- Given the chat the panel showed was deleted, when the panel opens,
  then it shows "No chat open" with New chat.
