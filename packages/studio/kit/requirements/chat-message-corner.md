# kit.chat-message-corner

- Status: active
- Since: unreleased
- Source: Sofia's Studio and Messenger alignment proposal on HAL-19755 (26 Nov), "One small mismatch found on the way"; built on HAL-19763

The box of a message the person sent in the kit's `ChatMessage` shall be the new design's bubble (HAL-20728): 7.5px corners, padding 6px above, 7px right, 8px below and 9px left, a one-pixel shadow, and at most 65% of the column wide.

## Examples

- Given a ChatMessage from "you" with "Sort this mail",
  when it renders,
  then its box has 7.5px corners and is at most 65% wide.
