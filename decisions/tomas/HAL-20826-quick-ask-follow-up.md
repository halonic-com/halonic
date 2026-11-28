# Decision: the quick-ask box gets the message box's edge in dark, and the chip moves to the first line

- Approval: the look check on HAL-20825 (Noah's [major] and [minor] on #6888); the maintainer approves this note in review
- Kind: user-visible

## What changes

`quick-ask.box-look` said the box has "no edge of its own" in light and dark alike. In dark the box
now draws a 1 px ring in the message box's edge colour (`--color-border-prompt`, `#353c4c`), so the
example splits into a light one (no border of its own, as before) and a dark one (the ring, still no
border). The requirement also says where the agent chip sits on a long question: by its first line,
with **Ask** by its last, and gains an example for it. No example was removed or weakened: the light
example keeps its words, and the dark one asks for more than before.

## Why

On a dark desktop the dialogs' shadow and its faint edge are lost, so the box's outline disappears
(screenshots on HAL-20825). A ring keeps the 8 px panel corner, which a border on the clipped box
would not. The chip by the last line of a three-line question read as if it belonged to that line.

## Covers

- quick-ask.box-look
