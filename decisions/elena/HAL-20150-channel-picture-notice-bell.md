# Decision: a channel's picture shows its members; Notices rows start with a bell

- Requirements: `messenger.agent-avatar-tint` (`packages/studio/features/messenger/requirements/agent-avatar-tint.md`)
- Task: HAL-20150, the rest of Sofia's proposal on HAL-19491 (parts b and c), approved by the board on 26 Nov
- Approval: Liam approves this note in his review of this pull request on HAL-20150
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ILHvE8SYJmAs6545R8YgsGbHIOdbwavGY2vyarv1FdSwm4C8lddOzsP2njVxRulzXK3iV549q6ET4ReUYsgDBQ==

## What changes

The board approved Sofia's proposal on HAL-19491. Part (b): in the Messenger's list and header, a
channel shows its lead agent in front with one more member behind, instead of the channel name's
letters on the neutral tile. Part (c): each Notices row in the Inbox starts with a bell.

- `messenger.agent-avatar-tint`: "A channel's own avatar shall stay neutral" becomes "A channel's
  picture shall show its members, each on their own tint (`messenger.channel-picture`)", and its
  second example now checks Elena's tile in the channel's picture instead of a neutral avatar.

New requirements: `messenger.channel-picture`, `inbox.notice-bell`.

## Tests

Two existing tests change, neither weaker:

- `needs-you.test.tsx`, "draws a channel question's asker on their own tint, the channel's
  members on theirs" (was "…, the channel's avatar neutral"): it checked that the channel's tile
  had no agent tint. It now checks that the channel's picture draws Elena's "E" on Elena's tint,
  which is the new rule.
- `notices-section.test.tsx`, "puts Open run and × on a line under the title when the row is too
  narrow": the bell now leads the row, so the title and the buttons wrap inside a box beside it
  instead of in the `li` itself. The test checks the same classes and the same grouping on that
  box (`title.parentElement`) instead of the `li`.

New: `channel-picture.test.tsx` (Messenger) and `notice-bell.test.tsx` (Inbox).

## Covers

- messenger.agent-avatar-tint
