# kit.avatar-picture

- Status: active
- Since: unreleased
- Source: the board's ask on HAL-18473 (HAL-10, 25 Nov 12:07 UTC): each agent's picture in the Messenger, its initial as the fallback; plan HAL-18485, approved with amendments by Liam (25 Nov): a canvas, not an `<img>`, so Studio's content security policy stays as it is

When the kit's `Avatar` is given a decoded picture, it shall draw the picture's centre square on a canvas on the same 28px round `surface-muted` tile, hidden from screen readers, and load no address. Without a picture, it shall show the initials as before.

## Examples

- Given a picture 4 pixels wide and 2 high,
  when the avatar renders with it,
  then it draws the middle 2 by 2 square on a hidden round canvas and shows no initials.
- Given no picture,
  when the avatar renders,
  then it shows the initials.
