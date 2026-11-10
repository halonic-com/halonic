# Decision: the ColourPopover closes on Shift+Tab onto its button, and its focus ring sits on `surface-raised`

- Approval: Liam's review of #1076 on [HAL-3648](/HAL/issues/HAL-3648) asked for these as follow-ups; Noah's visual check asked for the ring's gap; Liam (package reviewer) approves this note in review
- Kind: internal
- Task: HAL-3520

## What changes

The `kit.colour-popover` requirement now says three more things:

- Focus moving onto its opener **from the keyboard** (Shift+Tab from the presets) calls
  `onClose`, as any other focus leaving it does. Before, focus moving to the opener never
  closed it.
- Keyboard focus on a swatch is the standard focus ring with its 2px gap in `surface-raised`,
  the popover's fill. Before, it used `--focus-ring`, whose gap is the page's `surface`.
- Two presets may name the same colour.

Nothing else in the requirement changes.

## Why

- The opener was exempt so that a press on it wouldn't close the popover and let the click open
  it again. That exemption also covered Shift+Tab, so the popover stayed open with focus on the
  button (Liam). The anchoring hook already sees the press, so the opener is now exempt only
  while a press on it is under way: from its `pointerdown` to the next `click`, `pointercancel`
  or key press. Not until `pointerup`, because on a touch tap that comes before focus moves
  (Liam).
- In a dark scheme `surface` and `surface-raised` differ, so the ring showed a band of another
  colour inside the popover (Liam, Noah). The ring's accent still grows to 3px with more
  contrast, as `--focus-ring` does.
- The swatches were keyed by colour, so two presets of one colour gave React duplicate keys.
  They're keyed by place now (Liam).

No test was weakened or removed: the theme build test now checks the `surface-raised` ring and
its more-contrast width, and new tests cover Shift+Tab onto the button, a mouse press and a touch tap on it, a press
dragged off it, and a repeated preset.

## Covers

- kit.colour-popover
