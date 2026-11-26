# kit.avatar-size

- Status: active
- Since: unreleased
- Source: the Inbox and Messenger layout approved by the board on HAL-19192 (26 Nov), Sofia's sketches of 09:08 there: a 40px picture in an open item's header; built on HAL-19492

Where an `Avatar` is given the header size, it shall draw its initials in `text-small` or its picture on a 40px round tile instead of 28px, with the picture drawn at 40px in device pixels. Without a size, it shall stay 28px.

## Examples

- Given the name "Ada Lovelace" and the header size,
  when the avatar renders,
  then it shows "AL" on a 40px tile.
- Given a 400px picture and the header size, on a screen with one device pixel per CSS pixel,
  when the avatar renders,
  then it draws the picture on a 40 by 40 canvas.
- Given no size,
  when the avatar renders,
  then its tile is 28px.
