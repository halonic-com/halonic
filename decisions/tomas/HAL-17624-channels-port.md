# Decision: AgentMessaging version 4 adds channels

- Approval: HAL-17624, from the board's approval of the phase 2 card (HAL-17544) and section 1.2 of the phase 2 architecture note (HAL-17511)
- Kind: internal

The board approved channels, conversations with several agents, with the
phase 2 card. The port gets them as version 4: version 2 is the attachments
of HAL-17441 and version 3 the action items of HAL-17575, both on `main`.

Requirements edited, none weakened:

- `ports.agent-messaging` adds the channel calls (`startChannel`,
  `setMembers`, `browseChannels`, `joinChannel`, `leaveChannel`), the
  refusals `not-supported` and `bad-members`, the rule that a channel has 2
  to 8 agents of one source with the lead among them, and the rule that a
  message names who it is for only in `to`, with no way for an app to say who
  wrote it. Its first example now lists the channel calls next to the others,
  and a new example checks the member rule. Every earlier promise holds:
  writes are still sent at once or refused, never queued.
- `agent-host.messaging-hub` adds that the hub passes a message's `to` on
  unchanged and, until it joins channels across providers, lists no channel
  and refuses every channel write with `not-supported` without asking a
  provider. Nothing it did before changes.
- `ports.agent-messaging-actions` (HAL-17575) said the port "shall be at
  version 3". It now says version 3 or later, and its test checks that the
  version is at least 3: action items came in with version 3 and are
  unchanged in version 4. Everything else it promises stays.

The port's type test now expects the five new calls and the optional fourth
parameter of `send`, after its files; it still fails if any call names a provider or a write
can be queued.

## Covers

- ports.agent-messaging
- agent-host.messaging-hub
- ports.agent-messaging-actions
- packages/core/ports/src/agent-messaging.test.ts
- packages/core/ports/src/agent-messaging-actions.test.ts
