# Decision: the status bar's buttons fit the bar, and a save problem fills the bar

- Approval: decided by the team on HAL-8692 (Noah's spec, after Sofia's UX check on HAL-8421); it builds on the layout the board approved on HAL-8416
- Kind: internal
- Task: HAL-8421

Users see this change. The note is `internal` because no key is pinned for
`user-visible` notes yet, and a requirement change takes a signed note of either kind.

## What changes

- The kit's `Button` gets a fifth size, `xs`: 24px high, in the caption type, only for the status bar. **Try again** and **Compare** in the save note use it, so they no longer stick out 2px above and below the 24px bar. On a phone and a touch screen `xs` grows to 40px with a 48px hit area, like `sm`.
- The body's strong type moves from the classes every button shares into each size's classes, so `xs` can use the caption type without two font-size classes on one button. No other size changes how it looks.
- While the save note is a problem, the status bar takes the soft fill of the note's mark: `warning-soft` for fields or items not saved, `danger-soft` for a failed save. It fades in 120 ms, at once under reduced motion. The badges don't colour the bar.

## Why

Sofia's UX check found the 28px buttons taller than the 24px bar, and that a risk of losing work had moved to the quietest corner of the window. Noah decided the fill and its mapping on HAL-8692. `kit.button` changes from four sizes to five, and `shell.save-note` gains the button size and the fill. No test was weakened or removed; new tests cover the size, the note's `data-problem` tone, the bar's fill classes, and the contrast of `fg`, `fg-muted` and `accent-text` on both fills.

## Covers

- kit.button
- shell.save-note
