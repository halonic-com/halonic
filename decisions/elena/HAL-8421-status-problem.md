# Decision: the status bar's buttons fit the bar, and a save problem fills the bar

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-8692 (Noah's spec after Sofia's UX check on HAL-8421, building on the layout the board approved on HAL-8416; a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:koX4hIO7trvOsERHvVx2huwkZhk4c6yq02GGor7N+ZoQ48hb7mveVzNpCo6pgqKWpwApwyTfeIDCb3xfFdOYBg==
- Task: HAL-8421

## What changes

- The kit's `Button` gets a fifth size, `xs`: 20px high (as high as a Status chip), in the caption type, only for the status bar. **Try again** and **Compare** in the save note use it, so they no longer stick out of the 24px bar. Not 24px: the bar's 24px include its 1px top line, so a 24px button still stuck out by a pixel in Chromium. On a phone and a touch screen `xs` grows to 40px with a 48px hit area, like `sm`.
- The body's strong type moves from the classes every button shares into each size's classes, so `xs` can use the caption type without two font-size classes on one button. No other size changes how it looks.
- While the save note is a problem, the status bar takes the soft fill of the note's mark: `warning-soft` for fields or items not saved, `danger-soft` for a failed save. It fades in 120 ms, at once under reduced motion. The badges don't colour the bar.

## Why

Sofia's UX check found the 28px buttons taller than the 24px bar, and that a risk of losing work had moved to the quietest corner of the window. Noah decided the fill and its mapping on HAL-8692. `kit.button` changes from four sizes to five, and `shell.save-note` gains the button size and the fill. No test was weakened or removed; new tests cover the size, the note's `data-problem` tone, the bar's fill classes, and the contrast of `fg`, `fg-muted` and `accent-text` on both fills.

## Covers

- kit.button
- shell.save-note
