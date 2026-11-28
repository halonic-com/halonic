# Decision: Messenger's list column and chat in the new design

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20617 (the approved build plan, P4; part recipes on HAL-20672); Liam signs this note in review
- Kind: user-visible
- Task: HAL-20730

## What changed

- `messenger.framed-list`: it said the list sits on the window's frame and the open chat, and the
  activity panel beside it, are rounded panels of their own, 8px apart. It now says the page is
  the window's one framed panel; while the list and the chat show side by side, the list is a list
  column of the kit's size (`kit.list-column`) with its rows 8px in from both sides, and the chat
  shows beside it in a content pane, past a 1px line; the activity panel sits past a 1px line from
  the chat.
- `kit.framed-sidebar`, `inbox.framed-sidebar` and `shell.frame`: they named the Messenger as a
  user of the framed sidebar. They no longer do; nothing else in them changes.

The two tests that checked the 8px gap and the separate rounded panels now check the framed page,
the list column's size, the rows' inset, the 1px lines and the panel colour, and that the gap is
gone.

## Why

P4 of the HAL-20617 build plan moves the Messenger to the new design: the approved mockup
(`v26-messenger-light.png` on HAL-20617) draws the list column and the chat on one panel past a
1px line, and Sofia's flows (HAL-20673, line 38) give each sub-app's window only its list column
and content pane. Studio's window and Halonic Inbox keep the framed sidebar.

## Covers

- messenger.framed-list
- kit.framed-sidebar
- inbox.framed-sidebar
- shell.frame
- packages/studio/features/messenger/src/ui/messenger-page.test.tsx
- packages/studio/features/messenger/src/ui/activity-panel.test.tsx
