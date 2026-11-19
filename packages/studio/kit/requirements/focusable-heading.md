# kit.focusable-heading

- Status: active
- Since: unreleased
- Source: HAL-13529 (HAL-13469 PH1, a team decision under HAL-2282 with Sofia as designer); base component specs 23 A2

The kit's theme shall draw the standard focus ring (`focus-ring`: a 2px `surface` gap and a 2px `accent` ring, 3px with more contrast) on keyboard focus round every heading, `h1` to `h6`, that has `tabindex="-1"`, without the heading naming a class for it, so that a heading that takes focus from code looks the same on every page and never shows the browser's own outline. In forced colours the ring's outline shall take the system's `Highlight`. The kit's own focusable titles (the `EmptyState` title, a `ListHeading` with a `headingRef`, the `SidePanel` and sheet titles) shall not remove the outline, so that the ring shows in forced colours.

## Examples

- Given a page whose `h1` the shell focused after a key press,
  when the page shows,
  then the title wears Studio's ring, not the browser's 1px outline.
- Given an `EmptyState` whose title takes focus after the last row of its list goes,
  when the keyboard was last used,
  then the title wears the same ring.
- Given Windows high-contrast mode,
  when a focusable heading takes focus,
  then a 2px outline in `Highlight` shows round it.
