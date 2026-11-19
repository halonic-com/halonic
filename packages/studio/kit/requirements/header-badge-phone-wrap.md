# kit.header-badge-phone-wrap

- Status: active
- Since: unreleased
- Source: HAL-13647; C206 check NW2 (HAL-13638); decided by the team (HAL-2282) with Sofia as designer; WCAG 1.4.10

On a phone, the kit's `HeaderBadge` with `as="button"` (the trust badge) or `as="menu"` (the sample chip) shall never be wider than its 48px line: it shall be able to shrink below the width of its words, its words shall wrap between words, its button shall grow in height, and its icons shall stay at the top, level with the first line of words. While its words fit on one line it shall stay 24px high, and its line shall keep its 60px start. On desktop it shall not change.

## Examples

- Given the trust badge "Not trusted yet · Review" on a phone 195px wide (a 390px window at 200 %),
  when it renders,
  then it shrinks to its line, "Review" wraps to a second line inside the window, and the dashed ring stays level with "Not trusted yet ·".
- Given the sample chip "Sample · test model" on a phone 195px wide,
  when it renders,
  then it wraps the same way, with its info icon and chevron at the top.
