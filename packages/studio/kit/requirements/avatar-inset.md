# kit.avatar-inset

- Status: active
- Since: unreleased
- Source: the board's feedback on HAL-19536, item 3 (a bit more padding inside profile circles), plan approved by Liam on HAL-19539; built on HAL-19586

Where an `Avatar` shows a picture, it shall draw the picture as a circle inside the tile with 2px of padding at 28px and 3px at 40px, so the picture doesn't touch the tile's edge. Where it shows initials, it shall keep them centred on the tile with no padding.

## Examples

- Given a picture and no size,
  when the avatar renders,
  then the picture sits inside 2px of padding on the 28px tile.
- Given a picture and the header size,
  when the avatar renders,
  then the picture sits inside 3px of padding on the 40px tile.
- Given the name "Ada Lovelace", at either size,
  when the avatar renders,
  then "AL" is centred on the tile, with no padding.
