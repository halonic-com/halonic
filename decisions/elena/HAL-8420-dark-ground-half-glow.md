# Decision: the dark canvas is slate-950 and the frame glow is half strength in dark

- Approval: HAL-8416 (plan 9.3), the board's design decisions of 13 Nov; the package owner (Liam) signs this note in review
- Kind: internal
- Task: HAL-8420

Users see this change, and the board approved it on HAL-8416. The note is
`internal` because no key is pinned for `user-visible` notes yet, and a
requirement change takes a signed note of either kind.

## What changes

The `kit.halo-start-screen` requirement gains one sentence: the dark `canvas` is slate-950 (`#020617`), and
`bg-halo-frame` draws its glow at half strength in dark (15% and 14%, against 30% and 28% in light).

The halo utilities, the spot gradient, the glow shadows and the 4.5:1 contrast rule are unchanged.

## Why

The board decided on 13 Nov (HAL-8416) that the dark ground is darker and that the glow around the window
frame is calmer in dark. The requirement states the exact values, so the code and the tests can't drift from
what the board approved.

The theme test changes to expect the new values. No test was weakened or removed.

## Covers

- kit.halo-start-screen
- packages/studio/kit/src/theme-halo.test.ts
