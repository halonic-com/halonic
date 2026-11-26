# studio-click-test.try-it-steps

- Status: active
- Since: unreleased
- Source: HAL-18716 point 6 (the board's yes, 25 Nov), HAL-18869

When the Settings steps have opened the demo again, the click test shall check Writer's Try it chat:

1. **The chat comes back (step 14):** opening Writer from the Agents list shows the message step 1 sent, read from the saved chats (`agents.chat.saved`).
2. **A key is held (step 15):** a message holding a made-up key, sent with Enter, stays out of the chat while the key line ("This looks like an API key. …") shows under the box; **Send anyway** then sends it, and the line goes (`agents.chat.box-lines`).

Both need step 1 to have passed. The Build chat has no step: the desktop app doesn't load the Assistant feature.

## Examples

- Given Writer's page stays on screen after Agents is clicked,
  then step 14 fails as `STILL_ON_WRITER`.
- Given Writer opens again on an empty chat,
  then step 14 fails as `NOT_SAVED`.
- Given the message with the key shows in the chat at once,
  then step 15 fails as `KEY_SENT`.
- Given the key line stays after **Send anyway**, or the message never shows,
  then step 15 fails as `NOT_SENT`.
