# Decision: the approved taskbar icons, and an envelope for Inbox

- Approval: https://paperclip.ing/HAL/issues/HAL-19716
- Kind: user-visible

The board approved the final Windows taskbar icons on HAL-19183 (Sofia's `draw-r6.js`, with the
rounder envelope). So `studio.app-icons` changes: on Windows an icon has no slate tile any more,
the ring fills the icon with a navy centre, and the glyph takes the same share of the ring's hole
at every size, so Halonic, Messenger and Inbox look equally big. Each `.ico` gains 20, 30, 36 and
40 px, the sizes Windows asks for at 125 and 150% display scaling, and a hand-tuned image of a size
replaces the drawn one (Noah's, HAL-19716). `icon.png` and `icon.svg` keep the tile for macOS and
Linux. Inbox's glyph becomes the approved envelope, so `kit.app-logo` says envelope instead of
tray and adds that a glyph's cut-out shapes, such as the flap, show the background through them.
The in-app Inbox logo changes with it, as there is one source for both (HAL-18693); Liam decided
that for the team on HAL-19716. The tests change to match: the size list, the Inbox glyph's
expected shape, and new checks for the cut-out, the missing tile and the tuned images. The plan
was approved by Liam on HAL-19716.

## Covers

- studio.app-icons
- kit.app-logo
- apps/studio/src/studio/app-icons.test.ts
- packages/studio/kit/src/app-logo/app-logo.test.tsx
