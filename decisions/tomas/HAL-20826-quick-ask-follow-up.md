# Decision: the quick-ask box gets the prompt boxes' edge in dark, and the chip moves to the first line

- Approval: the look check on HAL-20825 (Noah's [major] and [minor] on #6888); the maintainer approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Nz/Ln3ZVUjD9tB9I+2M9mhiPszsI+LyiFWodPxyc+UE7dNNoGFT4eMKK9Vb2VFRoKAaYmODlTTnab1SXkv6OAQ==

## What changes

`quick-ask.box-look` said the box has "no edge of its own" in light and dark alike. In dark the box
now draws a 1 px ring in the prompt boxes' edge colour (`--color-border-prompt`, `#353c4c`), so the
example splits into a light one and a dark one. The light example's words change from "no edge of
its own" to "no border of its own": the ring is an edge too, so the example now names what stays
absent in both themes, a CSS border, and the light box draws the same as before. The dark example
asks for the ring and still no border. The requirement also says where the agent chip sits on a long
question: by its first line, with **Ask** by its last, and gains an example for it. No example was
removed, and none asks for less than it did.

## Why

On a dark desktop the dialogs' shadow and its faint edge are lost, so the box's outline disappears
(screenshots on HAL-20825). A ring keeps the 8 px panel corner, which a border on the clipped box
would not. The chip by the last line of a three-line question read as if it belonged to that line.

## Covers

- quick-ask.box-look
