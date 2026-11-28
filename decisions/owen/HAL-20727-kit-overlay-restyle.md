# Decision: the kit's menu, tooltip, dialog and toast take the new design's part recipes

- Approval: the task is HAL-20727; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:CZzGxQ1kalM37CRxyVVkLeLUCZPkhrwY/iNnFXL7JbeLD7Z87xhkuATiAc3C0OEkpKteV1jPnyZTJuBfB+qtAw==
- Task: HAL-20727

## What changes

Four kit requirements change their look, to the part recipes for the new layout (COMPONENTS.md on
HAL-20672). Behaviour, names and token names stay; only values and classes move.

- `kit.menu`: the menu is a `surface` panel with a 16px radius (was `surface-raised`, 12px); its
  edge stays the hairline in `shadow-2`, with no second border line. Items have a 12px radius and 12px side padding (was 8px and 8px).
  A leading icon draws 18px in a 20px box in `fg-muted`, or in the item's own colour when it is
  danger or disabled. Dividers are inset 8px from the sides.
- `kit.menu-description`: the description, the footer and the group labels have 12px at the sides
  (was 8px), so they line up with the item labels.
- `kit.tooltip`: an 8px radius (was 4px), in line with the other overlays.
- `kit.dialog`: `sm` is 500px wide (was 440px), and the overlay is 32% black in dark mode too (was
  56%). The desktop footer has 20px under the buttons (was 16px).
- `kit.toast`: the card has a 16px radius and 16px on the left (was 12px and 12px). Its actions are
  32px pills on the `surface-soft` fill, with a transparent outline inside their edge for forced
  colours, instead of underlined `accent-text` links. The requirement now also names the second
  action (`secondAction`) that toasts have carried since #2844, and an action that wraps to its own
  row sits 8px under the text.

The tests that named the old classes and values now name the new ones; none is removed or skipped.

## Why

Outside the four parts: the shell's Welcome column uses `max-w-dialog-sm`, so it widens from 440px
to 500px, and the palette borrows the dialog's overlay on purpose, so it takes the 32% too.


The board's new layout (HAL-20617) restyles the kit's parts, and Noah measured these values against
the reference screenshots. The recipe's toast sits on an inverse surface; the kit's toast keeps
`surface-raised`, because its tone icons and close button are drawn for that surface. Noah checks
that choice in the look review.

## Covers

- kit.menu
- kit.menu-description
- kit.tooltip
- kit.dialog
- kit.toast
