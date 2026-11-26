# kit.avatar-on-row-fill

- Status: active
- Since: unreleased
- Source: Noah's design check on HAL-19747 (26 Nov), a nit: a picture's tile and a plain row's hover and current fill are both `surface-muted`, so the tile's circle vanished on those rows; built on HAL-19751

While a `PlainRow` or a `plain` List row is hovered, pressed or current, an `Avatar`'s neutral tile inside it, with initials or behind a picture, shall be filled `surface` instead of `surface-muted`, so its circle stays visible on the row's `surface-muted` fill. Outside such a row, the tile shall stay `surface-muted`.

## Examples

- Given a `PlainRow` with a picture, current,
  when it renders,
  then the row is filled `surface-muted` and the picture's tile is filled `surface` on a current row.
- Given a `plain` List row with an Avatar, hovered,
  when it renders,
  then the row is filled `surface-muted` on hover and the Avatar's tile `surface`.
- Given an Avatar in a bordered List row or a top bar,
  when the row is hovered,
  then its tile stays `surface-muted`.
