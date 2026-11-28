# Decision: Messenger's list column and chat in the new design

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20617 (the approved build plan, P4; part recipes on HAL-20672); Liam signs this note in review
- Kind: user-visible
- Task: HAL-20730

## What changed

- `messenger.framed-list`: it said the list sits on the window's frame and the open chat, and the
  activity panel beside it, are rounded panels of their own, 8px apart. It now says the page is
  the window's one framed panel; while the list and the chat show side by side, the list is a list
  column of the kit's size (`kit.list-column`) with its rows 8px in from both sides, and the chat
  shows beside it in a content pane, past a 1px line. While nothing is connected and both would
  show, the list column is left out. Beside the chat or as a sheet, the activity panel has a 1px
  line at its start edge only; in the chat's place it has none; beside the chat its header is
  64px, the chat header's height. The list's header sits 20px in, in line with the rows.
- `kit.framed-sidebar`, `inbox.framed-sidebar` and `shell.frame`: they named the Messenger as a
  user of the framed sidebar. They no longer do. `kit.framed-sidebar` also says 16px corners
  where it said 12px: the panel has been `rounded-lg`, 16px, since #6626. Nothing else changes.

The two tests that checked the 8px gap and the separate rounded panels now check the framed page,
the list column's size, the rows' inset, the 1px lines and the panel colour, and that the gap is
gone. A new test finds no list column while nothing is connected in a wide window.

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
