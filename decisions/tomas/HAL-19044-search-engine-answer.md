# Decision: Ctrl K and the phone's Search sheet ask the search providers once the typing pauses

- Approval: the package owner (Liam) approves this note in review on HAL-19044
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jXpHA37Hohm6GlD84hcxaFjuhngrjBI9JgY02r5AoKOnPtpT9WeXrKIHA8d3d1NVuFlbPE++6jiSp9U8zrGfCQ==

## What changes

`shell.palette-wiring` and `shell.phone-search` said the palette and the sheet ask the search
providers each time the words change. They now ask once the typing pauses for 300 ms after the
words change, as the Search page already does (`search-page`). Until then the new words count as
being searched: the skeleton rows show and "Couldn't search" waits. `shell.palette-wiring` gains an
example for a title typed one letter at a time. No example was removed or weakened.

## Why

The installed-app click test (HAL-18354) typed the seeded task's title into Ctrl K and got
"Couldn't search". The agent host's log showed why: `Paperclip GET searchTasks failed: refused`,
then `Every messaging provider failed search`. Every search reads a connected Paperclip's task
list, and Paperclip refuses (HTTP 429) more than 8 task-list reads at once from one key. One
search per letter of a 27-letter title went over that, and when the refused one was the last,
Ctrl K showed "Couldn't search" until Try again. A person who types fast hits the same.

## Covers

- shell.palette-wiring
- shell.phone-search
