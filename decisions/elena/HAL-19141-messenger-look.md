# Decision: the Messenger's list loses its tabs and card chip, and agent bubbles get their own tint

- Task: HAL-19141
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19132 (the board approved the 8 Messenger look and layout changes on HAL-10, 26 Nov 03:51 UTC, and on the card on HAL-19132, 04:00 UTC; Sofia's sketches and values on HAL-19134)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2uThU0efrReIXqZD4hm/yjH3B+rGjiP2lVyjQljbFHBOCtCaLvwgDhzj5XPUdO14hHhCS4HbNgRUxYDenDbSBA==

## What changes

This pull request builds points 1 to 5 and 7 of the 8 approved changes. Search, Ctrl+F and the
"Needs you" panel (points 6 and 8) follow in the next pull request.

- `messenger.conversations`: the list has no "All" or "Waiting for me" tab; every conversation is in
  one list. Its example about choosing "Waiting for me" now says both conversations are listed. The
  test "lists under Waiting for me only the conversation whose agent wrote last" becomes "lists
  every conversation in one list, with no tabs".
- `messenger.chat-rows`: the "1 card" chip becomes a 6px violet dot after the name (also for a
  channel's question), and the unread dot becomes a count of the agent's messages since the
  person's own and since they last had the chat open, hidden on the open chat, "99+" past 99. The
  tests that pinned "Unread" and "2 cards" now pin "1 unread" and the dot; a new test covers the
  count, the hidden count and 99+.
- `messenger.agent-bubbles`: the bubble has no edge and is tinted in the agent's own colour instead
  of a neutral surface, and the name above a run is semibold in the normal text colour. The test
  that pinned `bg-surface-subtle` now pins one `bg-agent-*` tint, the same on both of Chief's
  messages, no `border`, and the name's classes.
- `messenger.channel-waiting`: with no "Waiting for me" tab, a channel's row no longer says "Elena
  asks you: Which hostname? · +1 more"; it shows the violet dot. Its test now checks the dot.
- `messenger.automatic-notes`: "set its unread dot, put the chat under Waiting for me" becomes
  "count as unread, count the chat as waiting for the person"; the examples say "unread count".
  Its tests are unchanged.
- `messenger.load-states`: the test "shows the tabs over loading rows" no longer counts two tabs;
  it still checks the loading rows and that "No chats yet" never shows. The requirement is
  unchanged.
- Two `messenger.conversations` focus tests that went to the tab (Back to chats after the chat
  left Waiting for me, leaving the last chat) now check the row of the answered chat and the
  list's first button.

No test is skipped or deleted, and no requirement is retired.

## Why

The board approved these changes to make the Messenger calmer and closer to a familiar messenger
(HAL-10, 26 Nov 03:51 UTC: "Ok lets do this."). What the tabs and the chip did moves to the violet
dot and, in the next pull request, the "Needs you" entry.

## Covers

- messenger.conversations
- messenger.chat-rows
- messenger.agent-bubbles
- messenger.channel-waiting
- messenger.automatic-notes
- messenger.load-states
