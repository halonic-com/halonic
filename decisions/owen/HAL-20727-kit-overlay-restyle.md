# Decision: the kit's menu, tooltip, dialog and toast take the new design's part recipes

- Approval: the task is HAL-20727; Liam approves this note in review
- Kind: user-visible
- Task: HAL-20727

## What changes

Four kit requirements change their look, to the part recipes for the new layout (COMPONENTS.md on
HAL-20672). Behaviour, names and token names stay; only values and classes move.

- `kit.menu`: the menu is a `surface` panel with a 1px `border` edge and a 16px radius (was
  `surface-raised`, no edge, 12px). Items have a 12px radius and 12px side padding (was 8px and 8px).
  A leading icon draws 18px in a 20px box in `fg-muted`. Dividers are inset 8px from the sides.
- `kit.tooltip`: an 8px radius (was 4px), in line with the other overlays.
- `kit.dialog`: `sm` is 500px wide (was 440px), and the overlay is 32% black in dark mode too (was
  56%). The desktop footer has 20px under the buttons (was 16px).
- `kit.toast`: the card has a 16px radius and 16px on the left (was 12px and 12px). Its action is a
  32px pill on a `surface-muted` tint instead of an underlined `accent-text` link.

The tests that named the old classes and values now name the new ones; none is removed or skipped.

## Why

The board's new layout (HAL-20617) restyles the kit's parts, and Noah measured these values against
the reference screenshots. The recipe's toast sits on an inverse surface; the kit's toast keeps
`surface-raised`, because its tone icons and close button are drawn for that surface. Noah checks
that choice in the look review.

## Covers

- kit.menu
- kit.tooltip
- kit.dialog
- kit.toast
