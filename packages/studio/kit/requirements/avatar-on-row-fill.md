# kit.avatar-on-row-fill

- Status: active
- Since: unreleased
- Source: Noah's design check on HAL-19747 (26 Nov), a nit: a picture's tile and a plain row's hover and current fill are both `surface-muted`, so the tile's circle vanished on those rows; built on HAL-19751, with Nora's review of #6668 (the focused row, the `on-muted:` rule); Nora's review of #6686 (a plain List row's keyboard focus), built on HAL-19492

While a `PlainRow` or a `plain` List row is filled `surface-muted`, an `Avatar`'s neutral tile inside it, with initials or behind a picture, shall be filled `surface` instead, so its circle stays visible. A `PlainRow` is filled while hovered, pressed or current, and while focus is inside it when it has an action; a `plain` List row while hovered or pressed, while keyboard focus is inside it, and while selected or current, but never while unavailable or inert. Each row shall mark that fill with `data-fill`, `data-hover-fill`, `data-focus-fill` or, for a fill that follows keyboard focus only, `data-focus-visible-fill` set to `muted`, and the tile shall step up with the kit's `on-muted:` variant. Elsewhere the tile shall stay `surface-muted`.

## Examples

- Given a `PlainRow` with a picture, current,
  when it renders,
  then the row sets `data-fill="muted"` and the picture's tile takes `surface` there.
- Given a `PlainRow` with an action,
  when focus is inside it,
  then the row is filled `surface-muted` and its tile `surface` (`data-focus-fill="muted"`).
- Given a `plain` List row with an Avatar, at rest,
  when it is hovered,
  then the row is filled `surface-muted` and the Avatar's tile `surface` (`data-hover-fill="muted"`).
- Given a `plain` List row with an Avatar, at rest,
  when it has keyboard focus,
  then the row is filled `surface-muted` and the Avatar's tile `surface` (`data-focus-visible-fill="muted"`), while a click's focus fills neither.
- Given a `plain` List row that is unavailable,
  when it is hovered,
  then neither the row's fill nor its tile changes.
- Given an Avatar in a bordered List row,
  when the row is hovered or current,
  then its tile stays `surface-muted`.
