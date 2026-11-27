# kit.plain-row-size

- Status: active
- Since: unreleased
- Source: the board's decision on HAL-10 (26 Nov): bigger rows in the Inbox's and the Messenger's sidebar lists; built on HAL-19735; the team's decision on HAL-19949 (26 Nov): a `PlainRow` without a picture keeps the 56px row; the board's brief on HAL-20557 (27 Nov): exactly the row's height, not at least; the new design's 72px row and 48px picture (build plan P2 on HAL-20617, HAL-20675)

The rows of a `PlainList` and of a `plain` `List`, the sidebar lists of the Inbox and the Messenger, shall be exactly 72px high with 6px of padding above and below, on a phone too; their title shall be 15px and the line under it 14px. A plain `List`'s row that wraps, shows an error's reason, has a part under its meta line or has text buttons may grow past 72px, so it never spills over the next row. A plain `List` shall give a row's avatar a 48px place. Where an `Avatar` is given the sidebar size, it shall draw its initials in `text-heading` or its picture on a 48px round tile, with the picture drawn at 48px in device pixels. While they load, their skeleton rows shall have the same 72px height and padding, with a 48px round block in the picture's place, so nothing moves when the rows arrive. A `List` that isn't `plain` shall keep its rows' sizes. A `PlainRow` without a picture shall keep the kit's 56px row, at least 56px high with 12px of padding above and below.

## Examples

- Given a `PlainRow` "Chief" with the line "Shall I merge #12?",
  when the list renders,
  then the row is exactly 72px high with 6px above and below, the title is 15px and the line 14px.
- Given a `PlainRow` "Fix the login test" without a picture and without a line,
  when the list renders,
  then the row is at least 56px high with 12px above and below, not 72px.
- Given a plain List with a row whose avatar is an `Avatar` with the sidebar size,
  when it renders,
  then the row is exactly 72px high, the avatar's place is 48px, the title is 15px and the meta line 14px.
- Given a List that isn't plain, with a meta line,
  when it renders,
  then its row keeps the 56px height, the 28px avatar, the 14px medium title and the 13px meta line.
- Given a 400px picture and the sidebar size, on a screen with one device pixel per CSS pixel,
  when the avatar renders,
  then it draws the picture on a 48 by 48 canvas.
- Given a plain List on a phone, with a row whose avatar is an `Avatar` with the sidebar size,
  when it renders,
  then the row is exactly 72px high with 6px above and below, and the avatar's place is 48px.
- Given a plain List that is loading, with an avatar in its skeleton shape,
  when its skeleton rows show,
  then each is exactly 72px high with 6px above and below, with a 48px round block.
- Given the Messenger's chats on their way,
  when the loading rows show,
  then each is exactly 72px high with 6px above and below, with a 48px round block.
