# Decision: the chat header, your message and the message box take the new design's look

- Approval: HAL-20728, built from the part recipes on HAL-20672 under the build plan on HAL-20617
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:VCRVsbaq2nIyj08IBEMnqTO4YHtK+R/M+3iAKufWr4QGr2aSbh4UMQj2EV29o3Yxnefj/pazXP33Icb5Oy4/DA==

## What changes

Four kit requirements change their look to the new design's recipes. Behaviour, names and
keyboard handling stay the same.

- `kit.content-header`: the header is 64px tall over a soft shadow, with no 1px line under it,
  15px from the picture to the title and its actions 16px apart.
- `kit.chat-message-corner`: the person's message is the new design's bubble: 7.5px corners
  instead of `rounded-lg`, padding 6 / 7 / 8 / 9px, a one-pixel shadow, at most 65% wide.
- `kit.chat-message`: that bubble takes the new own-message colour, `surface-own-message`
  (`#dbe7fe` / `#143170`), instead of `surface-muted`.
- `kit.prompt-look`: the `ChatComposer` leaves the prompt look's 24px corners and grey edge for
  the new design's message box: 26px corners, at least 52px tall, the raised surface, an edge
  that shows only on focus or an error (and the 3:1 edge under More contrast), and the composer
  shadow, deepening to the prompt's focus shadow on focus. A prompt `Input` and the
  `PaletteBox` keep the prompt look.

The values are new theme tokens (`rounded-bubble`, `rounded-composer`, `min-h-composer`,
`shadow-header`, `shadow-bubble`, `shadow-composer`, `text-chat-title`, `surface-own-message`).
The tests that named the old classes now name the new ones; none is skipped or removed.

## Why

The board's new design (HAL-20617) restyles the conversation to the measured recipes in
COMPONENTS.md (HAL-20672). The build plan keeps the kit's parts and token names, so the existing
parts change instead of a second set appearing.

## Covers

- kit.content-header
- kit.chat-message-corner
- kit.chat-message
- kit.prompt-look
