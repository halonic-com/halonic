# Decision: a chat's search field becomes the find bar (Ctrl+F)

- Task: HAL-19141
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19132 (the board approved the 8 Messenger look and layout changes on HAL-10, 26 Nov 03:51 UTC, and on the card on HAL-19132, 04:00 UTC; point 6: "In a chat, Ctrl+F opens a find bar (2 of 5, up/down, close)"; Sofia's sketch C on HAL-19134)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:m1Iozr5tewb3eL0ST8Z0eG5TiPI2FgovxCRRYwglEIIbpidNxN+KI/CGZdFx2nP0KoE3afNVy928kVlYBaXhDQ==

## What changes

This pull request builds points 6 and 8 of the 8 approved changes, on top of the first pull
request (points 1 to 5 and 7). It adds the requirements `messenger.chat-search`,
`messenger.find-in-chat` and `messenger.needs-you` with their own tests. No requirement changes.

The open chat's header had a search field that filtered the chat down to the messages holding the
text. The approved find bar keeps every message and moves between the matches instead, so these
`messenger.conversations` tests change how they search, not what they prove:

- "finds the chat's messages by their text" now opens the find bar with Ctrl+F and checks that the
  match is marked in the whole chat and that the bar says "1 of 1", instead of checking that the
  other message is hidden.
- "says so when no message in the chat matches the search" reads the same words, "No message in
  this chat matches.", from the find bar's status region, which stays outside the transcript.
- "reads out what the agent writes after the chat opened, but not on a search" searches with the
  find bar.
- "never lets a search's late answer replace a newer one's" guarded the filter's reads, which are
  gone: the find bar reads nothing. It becomes "finds without reading the chat again, so a find
  never shows an older read's messages".

The `messenger.typing` test "shows nothing … while the board searches" searches with the find bar;
the requirement and what it checks are unchanged.

No test is skipped or deleted, and no requirement is retired.

## Why

The board approved replacing the chat's search field with an icon and a find bar (HAL-10, 26 Nov
03:51 UTC: "Ok lets do this.").

## Covers

- messenger.conversations
- messenger.typing
