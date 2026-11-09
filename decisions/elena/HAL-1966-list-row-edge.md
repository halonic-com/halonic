# Decision: the List matches the states sheet (row edge, More button, heading, avatars, error dot)

- Approval: Noah, the kit's owner and designer, asked for these changes in his design check of
  the kit states page on [HAL-1966](/HAL/issues/HAL-1966) (L1 to L5); he approves this note in review
- Kind: internal
- Task: HAL-1966

## What changes

Two requirements are reworded to match the states sheet, and the tests that pinned the old
wording now check the new one:

- `kit.list`: the heading is the box's first line, not drawn above the box. The More button is
  always shown, in `fg-muted` until hovered, instead of only on hover and focus on desktop, and its
  cell's line and fills reach the box's edge. The focus ring goes round the whole row, More cell
  included. The error chip has its dot.
- `kit.skeleton-bar`: the `avatar` block is round.

In `list.test.tsx`, "is named by its heading, drawn above the box" becomes "drawn as the box's
first line" and checks that the heading is in the box and the first row has square top corners.
The More button test no longer expects `opacity-0 group-hover:opacity-100` on the cell; it checks
that the cell isn't faded and the button is `fg-muted` until hovered. The focus ring check expects
`focus-ring-row-start` and `focus-ring-row-end` on a row with a More cell, and `focus-ring-inset`
without one. In `skeleton-bar.test.tsx` the avatar block is `rounded-full`, not `rounded-sm`.

## Why

The screenshots of the states page showed rows that stopped 40px short of the box's right edge:
the More cell was faded out with `opacity-0`, which hid its line and fills along with the button.
The sheet shows the button dimmed at rest and the row reaching the edge, the heading inside the
box, round avatars, and a dot on the error chip, the shape cue for colour-only states (HAL-967).

No test was weakened or removed: each changed assertion checks the new behaviour, and the
keyboard, naming and touch checks are unchanged.

## Covers

- kit.list
- kit.skeleton-bar
- packages/studio/kit/src/list/list.test.tsx
- packages/studio/kit/src/skeleton-bar/skeleton-bar.test.tsx
