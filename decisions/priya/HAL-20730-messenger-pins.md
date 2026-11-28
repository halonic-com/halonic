# Decision: the open chat's ··· menu stays for Pin chat

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20730 (Chief, 28 Nov 11:46 CET: pinned chats in Messenger's list column, per Sofia's flows on HAL-20673); Liam signs this note in review
- Kind: user-visible
- Task: HAL-20730

## What changes

- The `messenger.read-marks` test "offers no ··· menu once the board wrote last" becomes "offers no
  Mark as unread in the ··· menu once the board wrote last". The ··· button no longer goes away
  when there's no agent's message to mark unread, because its menu now also holds **Pin chat** or
  **Unpin chat** (`messenger.pinned-chats`, new). The test still checks what `messenger.read-marks`
  asks: no **Mark as unread** without an agent's message newer than the person's own.
- `messenger.read-marks`: the ··· sentence said the header ends with the button "while the open
  chat has such a message", which read as if the button comes and goes with that message. It now
  says the header always ends with the button, and its menu holds Mark as unread while there's
  such a message. What Mark as unread does doesn't change.
- `messenger.conversations`: "newest first" becomes "newest first after the pinned chats
  (`messenger.pinned-chats`)", since pinned chats now come first.

## Why

Chief confirmed pinned and recent chats for Messenger's list column (HAL-20730), following Sofia's
flows (HAL-20673, lines 20 to 23). The chat header's ··· menu (Sofia's sketch H on HAL-19192) is
where the open chat's own actions live, so Pin chat goes there and the menu shows on every chat.

## Covers

- messenger.read-marks
- messenger.conversations
- packages/studio/features/messenger/src/ui/read-marks.test.tsx
