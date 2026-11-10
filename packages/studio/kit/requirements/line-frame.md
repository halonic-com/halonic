# kit.line-frame

- Status: active
- Since: 0.1.0
- Source: HAL-3517; base component specs 18.4 (LineFrame) and 15.6

The kit's `LineFrame` shall be the frame of a plain line at the top of a page: padding 8px 16px, at least 48px high, a 1px `border` line below and no fill, with a 16px icon slot top-aligned with the first line of its `text-small` text. Its text shall be `fg`, or `fg-muted` with the icon when it is `muted`, and shall wrap rather than be shortened.

## Examples

- Given a LineFrame with an icon and "Shared with your team.",
  when it renders,
  then it is at least 48px high, padded 8px 16px, with a `border` line below and no fill.
- Given a LineFrame whose text runs to two lines,
  when it renders,
  then its icon sits beside the first line.
