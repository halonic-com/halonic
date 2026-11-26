# messenger.needs-you-badge

- Status: active
- Since: unreleased
- Source: Sofia's proposal on HAL-19491, part (a), approved by the board on 26 Nov; built on HAL-19666

Where Needs you shows who asked a card (`messenger.needs-you`), the Messenger shall show the asking agent's picture when it was read, else the agent's initial on its tint, with the card's kind as a badge on it, as the Inbox does (`inbox.picture-badge`). The chats in the list shall show the picture only, with no badge, since a chat isn't an item.

## Examples

- Given Liam, who has a picture, asking to approve "Merge #12?", and Chief, without one, asking "Which hostname?",
  when you open Needs you,
  then Liam's card shows his picture with a stamp badge, Chief's shows "C" with a "?" badge, and no chat in the list has a badge.
