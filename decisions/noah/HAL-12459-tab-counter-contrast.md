# Decision: a coloured chip on a muted fill lays its soft fill over surface

- Task: HAL-12459
- Approval: team decision on HAL-12459 (an accessibility fix in the kit, from Sofia's keyboard and screen-reader check HAL-12426, row A9); Liam reviews the pull request on HAL-12459 and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:SVGo6IGBTV8xuuR2whvI8motEiIbtkFfvT/RCAqevkXOA2uAyfUR8TpRusYvOphq8jZ4dFBbmdlETuFGY6JwBw==

## What changes

On a muted fill (an unselected tab, a hovered sidebar row), the `accent`, `running`, `warning`, `danger` and `success` status chips lay their see-through soft fill over `surface` instead of over the muted grey, with the new `bg-over-surface-*` utility. They look just as they do on a page. `neutral`, `attention` (its soft fill is opaque) and `outline` don't change.

The `kit.status-chip` requirement gains that clause and one example. The status chip test that said the coloured tones don't change on a muted fill now says they lay their fill over surface there, and keeps the check that `attention` and the tag don't change. The theme's contrast test gains one pair per coloured tone in a muted fill. No test was weakened or skipped.

## Why

The "Needs you" counter on the workflow page's unselected Runs tab measured 4.27:1 in light and 4.23:1 in dark, below the 4.5:1 that 12px text needs (WCAG 1.4.3). A see-through soft fill darkens with the grey under it. Measured on the muted fill, `danger`, `running` and `success` fail too (4.22 to 4.35:1). Over `surface` every coloured tone reaches 4.95:1 or more in both themes.

## Covers

- kit.status-chip
