# Decision: on a phone, a centred Empty state's buttons are 48px and full width

- Task: HAL-16013
- Approval: Noah's decision on HAL-16009, written into the component specs (HAL-175) revision 53, sections 11 and 1 "On a phone". It applies the phone's main-action size that sheets and action bars already use, and the board-approved Nothing paired drawing (HAL-12206) already draws it this way, so it's a team decision under HAL-2282 with no board card. Liam signs at review.
- Kind: user-visible

## What changes

- `kit.empty-state`: in the `phone` presentation, a centred Empty state that isn't `plain` (the default tone and the centred `tone="error"`) draws its buttons at `touch` (48px) and full width (`block`), stacked 8px apart with the primary on top. Its `link` stays an inline link under them. A `plain` one and `align="start"` keep their size (`md`, drawn at 40px with the 48px hit area on a phone; `lg` for the section error). On a desktop nothing changes. One new example says so; the existing examples and tests don't change.

## Why

A centred Empty state is the whole content of its screen, so its button is that screen's one main action. On a phone the main action is a 48px full-width button everywhere else. Words check C662 (HAL-15979) measured Paired computers' "Pair with a computer" at 178 × 40 at 390px. The size comes from the presentation context, as Dialog's stacked phone buttons do, never from reading the window width (component specs 0.2).

## Covers

- kit.empty-state
