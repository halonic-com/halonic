# Decision: Inbox pictures check their read type and size; hub attachment wording

- Task: HAL-17484
- Approval: Liam asked for both requirement changes in his reviews of #5643 (HAL-17661) and Julian's security check HAL-17477; collected on HAL-17484. Liam reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ic3O6ge3IJmwcMjOZ+VKt+d/Pctfz4rfA/boaMYiFKgUmg9n4fsN3Oin04l8XuNIRAUIU0NngknmBzqEJxZPBA==

## What changes

- `inbox.agent-item-media` gains one sentence and two examples: the Inbox decodes an image only when the type its read returns is PNG, JPEG, GIF or WebP, never reads or decodes one listed or read above a byte limit (20 MiB), and never draws one that decodes above a pixel limit (8192 × 4320). Each says the already approved "Couldn't load the image." Julian's findings 1 and 2 on HAL-17477.
- `agent-host.messaging-hub-attachments`: "without asking any provider" becomes "without asking any provider for its bytes", as Liam asked on #5643. What the agent host does is unchanged.

## Why

The type a source lists for a file isn't proof of what its read sends, and a small file can decode to a huge bitmap. The hub wording was wider than the behaviour: the host does look up which provider listed the attachment, it only never asks one for the bytes.

## Tests

No test was skipped or weakened. `agent-bundles-media.test.tsx` gains tests for a read that returns `image/svg+xml`, an image listed above the byte limit, a read above it, a bitmap above the pixel limit, and the bitmap closing only when the card goes under strict mode.

## Covers

- inbox.agent-item-media
- agent-host.messaging-hub-attachments
