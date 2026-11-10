# kit.tab-hover

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); base component specs 24.5 (window tabs, state T4)

The kit's theme shall have a `bg-tab-hover` utility for a hovered inactive window tab: one background layer of `surface` at 45%, with no colour token of its own, so the window frame under the tab shows through. With each of the four frame colour presets, in light and dark, at both ends of the frame's gradient, `fg`, `fg-muted` and `accent-text` on that layer over the frame shall reach 4.5:1.

## Examples

- Given the amber preset (`#FBBF24` / `#F97316`) in light mode,
  when a tab is hovered at the frame's violet end,
  then its name in `fg` reaches 4.5:1 on `bg-tab-hover`.
- Given a hovered inactive tab,
  when the frame's colour preset changes,
  then the hover follows it, because the layer only lightens what shows through.
