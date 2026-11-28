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
- `messenger.read-marks` itself doesn't change: it says when the menu holds Mark as unread, not
  that the button is absent otherwise.

## Why

Chief confirmed pinned and recent chats for Messenger's list column (HAL-20730), following Sofia's
flows (HAL-20673, lines 20 to 23). The chat header's ··· menu (Sofia's sketch H on HAL-19192) is
where the open chat's own actions live, so Pin chat goes there and the menu shows on every chat.

## Covers

- packages/studio/features/messenger/src/ui/read-marks.test.tsx
