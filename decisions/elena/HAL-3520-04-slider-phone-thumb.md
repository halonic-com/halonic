# Decision: on a phone the Slider's thumb has no grab area of its own

- Approval: Noah (designer) chose this on [HAL-3670](/HAL/issues/HAL-3670) and agreed that spec 18.6 is updated to match; Liam (package reviewer) approves this note in review of the follow-up to #1055
- Kind: internal
- Task: HAL-3520

## What changes

The `kit.slider` requirement said that on a phone the thumb takes a 24px grab area round its
16px circle. It now says the thumb stays a 16px circle without a grab area of its own, and the
48px-high slider takes the press. Nothing else in the requirement changes.

## Why

A native range input moves the thumb's centre across the track less the thumb's width. With a
24px grab area the visible 16px circle stopped 4px short of each end, so a stub of track showed
past it at the ends of the range (Noah's visual check of #1055 at 10% and 100%). Round ends
matter more than the grab area, and the whole 48px height of the control is already the hit
area, so a press near the thumb still lands on it.

The theme build test that checked the 24px phone rules now checks that there are none and that
the thumb stays 16px. No other test changes.

## Covers

- kit.slider
