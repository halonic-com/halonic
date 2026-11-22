# Decision: a 40px letter tile and a described-by line for the kit, for the phone's C673 fixes

- Task: HAL-16111
- Approval: a team decision under HAL-2282: visual check C673 (HAL-16092), rows 1 to 3, bringing the build back to the phone screens the board approved on HAL-12206. No new screen or flow. Liam signs at review.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:SErRTWfrPSlQ3cB6DDhgT/AYC6jAT5oID7ycNL6xmHJsSrp6wG//uT+4rYsQF2hbVLl37rFJqOS+y8Dfz7MVBw==

## What changes

- `kit.letter-tile`: `LetterTile`'s `size` prop (`sm` 28px, the default, and `lg` 48px, from HAL-16050) gets a third size, `md`: a 40px tile with the 12px radius and the letter in `text-body`, for the phone's Agents list, as large as Paired computers' laptop tile. `sm` and `lg` are unchanged, so every other screen looks the same.
- `kit.text-area`: `TextArea` gets the `describedBy` prop `Input` already has. It adds a line outside the box's Field to its description, read after the Field's own. Nothing changes for a TextArea that doesn't pass it.

## Why

The phone's agent tile was 28px where the approved drawing has 40px, next to a 40px laptop tile one screen away. The stale prompt box said why it was off only in the placeholder of a disabled box, at 2.1:1, which a keyboard couldn't reach. It now stays focusable and points at a visible line under it, which needs `describedBy` on `TextArea`. Both are additions with the old behaviour as the default.

## Covers

- kit.letter-tile
- kit.text-area
