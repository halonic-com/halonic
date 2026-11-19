# Decision: on a phone, the header badges show in the notice strip

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12557 (Noah's answer, option 1 narrowed, after his spec on https://paperclip.halonic.com/HAL/issues/HAL-8692; a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Task: HAL-8421

## What changes

- On a phone, the header badges had nowhere to show: the phone has no status bar. Now the notice strip under the top bar shows them after the save problem's row: the trust badge on the kit's phone line, indented 16px, then the connector states ("Needs sign-in again · Fix", "Gmail API off") in one row of chips that wraps, 8px apart. Each row draws the line under it, so there's one line between rows and one under the strip.
- The kit's `HeaderBadge` gets `phoneLine: "more" | "strip" | "none"` (default `more`, as today). `strip` is the 16px indent without a line of its own; `none` is the bare chip, for the chips row. This adds to component specs 20.1 (phone); the More page doesn't change.
- The sample chip stays on the More page and isn't in the strip.
- In a short window the badge rows are left out, so the page keeps its room; the save problem's row stays. The spec says under 480px high. I used the kit's existing `short` variant (under 36em, 576px at the default text size), which the frame already uses for a phone held sideways, so the frame has one meaning of "short" instead of two.
- The save problem's fill moved from the strip to its own row, so the badge rows keep `surface-subtle`.

## Why

Sofia's UX check on HAL-8421 found that "Not trusted yet", "Needs sign-in" and "API off" were invisible on a phone. Noah placed them on HAL-8692 and settled the conflict with the kit's phone line on HAL-12557. `kit.header-badge` gains the strip's line, `shell.header-badges` and `shell.phone-bars` name the strip, and the new `shell.phone-notice-badges` describes the rows. No test was weakened or removed: the strip test in `shell-frame.test.tsx` now reads the save row's classes where it read the strip's, and the e2e test reads the fill from the save row. New unit tests cover the rows and the kit option, and two new e2e tests check the rows, the 16px indent and the short window in a real browser.

## Covers

- kit.header-badge
- shell.header-badges
- shell.phone-bars
