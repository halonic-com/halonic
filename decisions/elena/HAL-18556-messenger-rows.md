# Decision: chat rows show the newest message, and the agent's activity moves to the header

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10 (the board approved the design review HAL-18481 in full on 25 Nov, 13:28 UTC; built on HAL-18556)
- Kind: user-visible

The design review's improvement 4 gives each chat row the newest message, its time, an unread dot
and a "1 card" chip (new requirement `messenger.chat-rows`), and says the source's label shows once,
in the open chat's header, not on every row. `messenger.conversations` said each row shows its
source's label and its agent's activity. It now says the rows tell chats from different sources
apart by their source's label, which a row still shows whenever the list holds more than one
source, and the open chat's header shows the label and the activity. The two tests that read the
rows now check the new row text and the header; no test was removed and none checks less.

## Covers

- messenger.conversations
