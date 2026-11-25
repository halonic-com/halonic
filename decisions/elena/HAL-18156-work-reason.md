# Decision: a failed work line carries its reason

- Approval: HAL-18156, from Liam's review of #5922 (HAL-17631) and the work-line row of HAL-17514's wording table, approved with the phase 2 card (HAL-17544)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BvtTZHZ9TWjR0U4WWF1Anut93U2MoUsHZ0CbJamFYE1UPt8v6UXuwDI+8T4JPDHELnbXOIo/cQXecsuoFgKfAA==

HAL-17514's wording table has "✕ Elena couldn't finish: *reason*" for a
failed work line, but `MessageWork` had no reason, so the Messenger said
"Elena's task was closed without an answer." for every failed line.
`MessageWork` gets an optional `reason`, and the port a cap,
`messageWorkReasonMax` (300 characters, as an action step's error text). The
field is optional, so every provider and app that doesn't set or read it is
unchanged, and the port stays at version 4.

Requirements edited, none weakened:

- `ports.agent-messaging` adds that a failed work line may carry the reason
  its source gives, as plain text that apps show cut to 300 characters, and an
  example that checks the type and the cap. Every earlier promise and example
  holds.
- `contracts.fake-agent-messaging-channels` adds that the fake lists a
  message's work lines as it was given them, a failed line's reason included,
  with the example "a failed work line keeps its reason". Everything it
  promised before stays.
- `messenger.channel-messages` (from #5922, now on `main`) adds the line "✕ Elena
  couldn't finish: Build broke" when the source gives a reason, keeps "✕
  Elena's task was closed without an answer." when it doesn't, and adds an
  example for both and for the cut. The six lines of its first example are
  unchanged.

No test or golden file is weakened, skipped or deleted.

## Covers

- ports.agent-messaging
- contracts.fake-agent-messaging-channels
- messenger.channel-messages
- packages/core/ports/src/agent-messaging.test.ts
- packages/adapters/memory/src/fake-agent-messaging-channels.test.ts
- packages/studio/features/messenger/src/channel.test.ts
