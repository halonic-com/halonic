# Decision: Messenger's list column and chat in the new design

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20617 (the approved build plan, P4; part recipes on HAL-20672); Liam signs this note in review
- Kind: user-visible
- Task: HAL-20730

## What changed

`messenger.framed-list` said the list sits on the window's frame and the open chat, and the
activity panel beside it, are rounded panels of their own, 8px apart. It now says the list is a
list column of the kit's size (`kit.list-column`) and the chat shows beside it in a content pane,
past a 1px line, both on the panel colour; the activity panel sits past a 1px line from the chat.

The two tests that checked the 8px gap and the rounded panels now check the list column's size,
the 1px lines and the panel colour, and that the rounded edge and the gap are gone.

## Why

P4 of the HAL-20617 build plan moves the Messenger to the new design's two columns, the same
layout Settings (`shell.settings-two-columns`) and Library (`library.list-column`) already use,
now that the rail is in the window (HAL-20676). The frame and the 8px gap belonged to the old
framed sidebar, which the rail replaces.

## Covers

- messenger.framed-list
- packages/studio/features/messenger/src/ui/messenger-page.test.tsx
- packages/studio/features/messenger/src/ui/activity-panel.test.tsx
