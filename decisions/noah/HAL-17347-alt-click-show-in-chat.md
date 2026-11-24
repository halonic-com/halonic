# Decision: Alt-click an agent or workflow row shows it in chat

- Approval: flow-assistant 5.7 and 8, approved by the board (HAL-647); scoped on HAL-17347, where Liam reviews the pull request and signs this note
- Kind: user-visible

Two requirements widen, and neither narrows a promise.

`kit.list` gains `onAltOpen`: with only Alt (⌥ on a Mac) held, Enter and a click on a row call it
instead of `onOpen`. Before, Alt held did nothing, and it still does nothing in a List without
`onAltOpen`, so every List that exists today behaves as before. A middle click with Alt held, and
Shift held, still do nothing; Ctrl or ⌘ with Alt still opens a new tab.

`assistant.chat.show-in-chat` gains the overview rows' Alt-click and Alt Enter, as flow-assistant
5.7 and 8 ask: an agent or workflow row shows the item in the Build chat, the same as its ⋮'s "Show
in chat", and a plain click still opens it. Not on a phone, where the rows' ⋮ has no "Show in chat"
either. A broken file's row opens as on a plain click. Skills and other kinds pass no `onAltOpen`,
so Alt does nothing on them, as before.

No test was weakened or removed; new tests cover both.

## Covers

- kit.list
- assistant.chat.show-in-chat
