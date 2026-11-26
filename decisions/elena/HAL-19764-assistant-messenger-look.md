# Decision: the Assistant's Recent chats mark items to review with the violet dot, and Needs you tints a channel question's asker

- Task: HAL-19764 (PR 2 of HAL-19753)
- Approval: Sofia's alignment proposal on HAL-19755, carried out under the board's "build first, review after" rule for HAL-19753 (26 Nov, 13:27 UTC); the Needs you tint is Sofia's finding on the design check HAL-19777
- Kind: user-visible

## What changes

- `assistant.chat.phone-screen`: the Recent chats sheet's rows show "the running dot or the violet dot" instead of "the running dot or "2 to review"". The new `assistant.chat.recent-chats-dot` says how: plain rows as in the Messenger, the violet dot after the title, still read as "2 to review".
- `messenger.agent-avatar-tint`: one sentence and one example added. A question asked in a channel shows its asker's initials on that agent's tint in Needs you. The channel's own avatar stays neutral.

Tests changed: the two phone Recent chats tests now find the rows by `data-row-id` instead of grid cells, and read the row's text instead of its `aria-label`; they still check the same titles, order, "2 to review" and picking a chat. None weakened. New tests cover the violet dot, the running dot and the asker's tint.

## Why

Sofia's proposal (point 1 of HAL-19141): a chat with items to review reads like a Messenger chat with an open card, so it takes the same dot. Her design check of #6570 found that the asker's colour changed between Needs you and the channel.

## Covers

- assistant.chat.phone-screen
- assistant.chat.recent-chats-dot
- messenger.agent-avatar-tint
