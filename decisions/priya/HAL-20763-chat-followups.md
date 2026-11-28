# Decision: the chat header's line in dark, the message box's dark edge, the header's phone gaps

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20776 (the kit owner's look check of the new design's chat parts); Liam signs this note in review
- Kind: user-visible
- Task: HAL-20763

## What changes

- `kit.content-header`: the header's parts are 12px apart, not 16px, while the layout is the
  phone's. The header keeps "no line under it" in light only: in dark it has a 1px line in the old
  divider's colour (`#1B2638`), and under More contrast the 3:1 `border-control` line.
- `kit.prompt-look`: the chat's message box keeps its see-through edge in light only; in dark the
  edge is `#1B2638`. Focus (`accent`) and More contrast (`border-control`) don't change.

## Why

The kit owner's look check of #6860 (HAL-20776) found three faults the rules as written cause:

- In dark the header's shadow doesn't show: 12% black on the `#060D1D` panel moves a pixel by one
  step of 255, and a deeper shade by at most 10, so the header had no visible bottom edge. Under
  More contrast it had lost the 3:1 line it had before.
- In dark the message box was only its fill, 1.08:1 on the panel, where it had a 1.76:1 edge
  before. `#1B2638` gives 1.28:1, close to the light prompt edge's accepted 1.34:1.
- On a 390px phone the one-pane Inbox header's title lost 15px to the wider gaps and cut a word
  earlier. With 12px gaps below 600px it has its 137px again; from 600px up the 16px gaps stay.

## Covers

- kit.content-header
- kit.prompt-look
