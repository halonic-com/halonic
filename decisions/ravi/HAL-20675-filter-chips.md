# Decision: filter chips take the new design's look

- Task: HAL-20675
- Approval: Liam signs this note for HAL-20675 (build plan P2 on HAL-20617, approved; filter chips are in Ravi's part of P2, HAL-20725). A team decision on an approved plan.
- Kind: user-visible

## What changes

`kit.filter-chips` changes only in the chip's look, to the new design's chip from Noah's part
recipes (HAL-20672):

- 32px high everywhere, not 28px on desktop; the 48px hit area on a phone or a touch screen stays.
- The words are `text-body` (14px) at weight 600 whether the chip is on or off, not `text-small`
  with 500 only when on, so a chip keeps its width when it turns on.
- An off chip has no fill and the divider's `border` edge, not a `surface` fill with the
  `border-control` edge. With more contrast the theme raises `border` to 3:1.
- An on chip keeps `accent-soft`, `accent-text` and its 12px check. The design has no check; the
  kit keeps it so that on and off differ in shape as well as colour (component specs 23 A11).

The row's padding, the picker chips' behaviour and everything else in the requirement stay. Every
screen with filter chips (Runs, Search, the overview, the Library's collection page, Routines,
Team, the phone's Messenger) changes look at once.

Two test files change to the new values, none weakened: `filter-chips.test.tsx` and
`filter-chips-picker.test.tsx` still check the height, the hit area, the type, the off and on looks
and the check.

## Why

The board picked the new design for the whole Studio (HAL-20617), and the build plan restyles the
kit's parts to it rather than adding a second set.

## Covers

- kit.filter-chips
- packages/studio/kit/src/filter-chips/filter-chips.test.tsx
- packages/studio/kit/src/filter-chips/filter-chips-picker.test.tsx
