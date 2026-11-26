# kit.avatar-edge

- Status: active
- Since: unreleased
- Source: Noah's visual check of the Messenger chat list on HAL-19814 and HAL-19828 (26 Nov): a hovered, focused or open plain row is filled `surface-muted`, the initials tile's own fill, so the circle vanished

Where an `Avatar` has no picture, it shall draw a 1px inset `border-strong` edge on its initials tile, at both sizes, so the circle stays visible on a row filled `surface-muted`. Where it has a picture, it shall draw no edge.

## Examples

- Given the name "Ada Lovelace" and no picture,
  when the avatar renders, in a row or a header,
  then its tile has a 1px inset `border-strong` ring.
- Given a picture,
  when the avatar renders,
  then its tile has no ring.
