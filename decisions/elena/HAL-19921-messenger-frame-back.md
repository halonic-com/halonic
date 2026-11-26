# Decision: the Messenger's list goes back on the frame (retire messenger.one-panel)

- Approval: https://paperclip.ing/HAL/issues/HAL-19921
- Kind: user-visible

`messenger.one-panel` (HAL-19539, built in #6530) put the Messenger's chat list, the open chat and
the activity panel on one joined panel. That came from a misread of the board's polish feedback on
HAL-19536, item 5. On HAL-10 (26 Nov, 16:53 UTC) the board corrected it: the Messenger's sidebar
was good as it was, in the frame, and the framed look was meant for Studio and the Inbox (HAL-19923).
So `messenger.one-panel` is retired and its two tests are replaced by `messenger.framed-list`, which
says what the Messenger drew before #6530: the list on the window's frame, the chat and the
activity panel each a rounded panel of their own, 8px apart. The code is #6530's Messenger part,
reverted. The rest of #6530 (padded avatars, the Inbox's 40px header picture) stays.

## Covers

- messenger.one-panel
- packages/studio/features/messenger/src/ui/messenger-page.test.tsx
- packages/studio/features/messenger/src/ui/activity-panel.test.tsx
