# kit.chat-message-corner

- Status: active
- Since: unreleased
- Source: Sofia's Studio and Messenger alignment proposal on HAL-19755 (26 Nov), "One small mismatch found on the way"; built on HAL-19763

The box of a message the person sent in the kit's `ChatMessage` shall have the `rounded-lg` corners of the person's bubble in the Messenger, so the person's message looks the same in every chat.

## Examples

- Given a ChatMessage from "you" with "Sort this mail",
  when it renders,
  then its box has `rounded-lg` corners.
