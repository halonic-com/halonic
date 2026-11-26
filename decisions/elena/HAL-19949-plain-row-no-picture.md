# Decision: a PlainRow without a picture keeps the 56px row

- Approval: /HAL/issues/HAL-19949
- Kind: user-visible

## What changes

- `kit.plain-row-size`: one sentence and one example added. A `PlainRow` without a picture keeps
  the kit's 56px row, at least 56px high with 12px above and below, not the sidebar's 80px.
  Everything the requirement already said about rows with a picture, plain `List`s, the sidebar
  `Avatar` and the skeleton rows stays as it is.
- `kit.plain-row-size`'s `Source:` line names this team decision next to the board's.

## Why

The 80px floor (HAL-19735, the board's decision on HAL-10, 26 Nov) was decided for the Inbox's
and the Messenger's sidebar rows, which have a 60px picture and two lines of text. The Assistant's
Recent chats sheet on a phone (HAL-19764) uses `PlainRow` with no picture and one title line, so
each row was mostly empty and about a third fewer chats fit on the screen (Noah's visual check,
HAL-19941). This is a team decision on HAL-19949 that builds on the approved screens: it adds a
case the board's decision didn't cover and changes nothing for the sidebar rows.

## Covers

- kit.plain-row-size
