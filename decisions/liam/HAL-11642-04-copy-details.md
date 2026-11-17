# Decision: a Home section's error may have Copy details

- Task: HAL-11642
- Approval: the states audit on HAL-11635 (https://paperclip.halonic.com/HAL/issues/HAL-11635#document-states-audit), "Home sections, failed", sent to Liam as HAL-11642 (https://paperclip.halonic.com/HAL/issues/HAL-11642). Microcopy 22 F13 is board-approved; this applies it. A team decision with no board card.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3TPHraE5V0ti9LQXf0eKBUKExUYdRpckVtwVQdxoOI2uwSAIDzKjem0z1YnIfR2hbFBdcG4h+3rJyD1YYVUJBA==

## What changes

The kit's start-aligned section error (`EmptyState` with `align="start"`) may now take a `link`,
drawn after Try again exactly as a centred error draws its link. `kit.empty-state` says so and has
a new example and test. The test that the type refused a link on a section error (a
`@ts-expect-error` line) is replaced by a test that it draws one. Home uses it for **Copy
details** when a section fails with an error Halonic can't explain (`shell.home-copy-details`).

## Why

F13 says an error Halonic can't explain offers Copy details, so the user can report it. Home's
sections said "Halonic ran into a problem it can't explain yet." with no way to get the details.
This reuses the link the board approved for centred errors; no new visual design.

## Covers

- kit.empty-state
