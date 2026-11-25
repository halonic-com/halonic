# messenger.agent-pictures

- Status: active
- Since: unreleased
- Source: the board's ask on HAL-18473 (HAL-10, 25 Nov 12:07 UTC): each agent's Paperclip picture in the Messenger's list rows and chat header, its initial as the fallback; plan HAL-18485, approved with amendments by Liam (25 Nov)

When a chat's agent has a picture, the Messenger shall draw it in the chat's list row and in the open chat's header, read through the engine once per picture while the Messenger is open, and not read it again when the list is read again. While the agent has no picture, or its read was refused, or its bytes don't decode as a PNG, JPEG or WebP picture, the Messenger shall show the agent's initial instead.

## Examples

- Given a chat with Liam, who has a picture,
  when the Messenger opens and the chat is opened,
  then the row and the header draw Liam's picture, and it was read once.
- Given that chat,
  when a source changes and the list is read again,
  then Liam's picture isn't read again.
- Given a chat with Chief, who has no picture, and one with Bo, whose picture can't be read,
  when the Messenger opens,
  then both rows show the initial.
