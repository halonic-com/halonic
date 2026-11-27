# Decision: the rail button is the one kit part that scales

- Task: HAL-20675
- Approval: Liam signs this note for HAL-20675 (build plan P2 on HAL-20617, approved). A team decision on an approved plan.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:LpvwE0dR4R6EtUhBkSvbCzlnWdg1hdIVpitwCnJVSjt5WmAFdpOhmVLUFCt9AxRIhbapPP5Cx93OaDpqaRphDQ==

## What changes

The kit's motion rule (design review HAL-18481, written in `theme.css` and the kit's README) says
nothing scales. The new `RailButton` gets the one exception the build plan names: its 24px drawing
grows to 110% under the pointer in 180ms and shrinks to 90% while pressed in 60ms, as in Noah's
recipes (HAL-20672). The selected button doesn't scale, and under reduced motion nothing scales.

The requirement `kit.rail-button-motion` records it, with a test that no other kit part grows or
shrinks under the pointer or when pressed, so the exception can't spread. `theme.css` and the
README say the same, and the theme gets two durations for it, `--duration-rail-hover` (180ms) and
`--duration-rail-press` (60ms). No existing requirement or golden file changes; one existing test
changes, not weakened: the list of agreed duration tokens in `theme.test.ts` names the two new ones.

## Why

The board picked the icon sidebar of the new design (HAL-20617), whose buttons answer the pointer
with this small scale. Limited to the rail, it marks the app switcher as the window's main control
without bringing movement back to the rest of the Studio.

## Covers

- kit.rail-button-motion
- packages/studio/kit/src/rail-button/rail-button.test.tsx
- packages/studio/kit/src/theme.css
- packages/studio/kit/src/theme.test.ts
