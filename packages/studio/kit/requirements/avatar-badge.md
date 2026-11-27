# kit.avatar-badge

- Status: active
- Since: unreleased
- Source: Sofia's proposal on HAL-19491, parts (a) and (c), approved by the board on 26 Nov; built on HAL-19666; the new design's 72px rows and 48px pictures (HAL-20675)

Where an `Avatar` is given a badge, it shall draw the badge as a round tile at its bottom right, 16px on a 28px tile and 20px on a 40px or 48px tile, hidden from screen readers like the tile. On a 28px tile with a badge, the initials shall keep one letter, so the badge covers none of the second. Where an `Avatar` is given a glyph, it shall draw the glyph on the neutral tile in place of the initials. `KindIcon` shall draw a glyph for each kind: a stamp for an approval, a "?" for a question, steps for an action, an arrow out for an item answered elsewhere, a sheet for a task, a speech bubble for a comment, a bell for a notice, a pause for a person step, a gear for setup and a silhouette for a sender nobody named.

## Examples

- Given the name "Chief" and an approval badge in the sidebar size,
  when the avatar renders,
  then it shows "C" on a 48px tile with a 20px stamp badge at its bottom right.
- Given the name "Sam Lee" and a question badge at 28px,
  when the avatar renders,
  then it shows "S" with a 16px "?" badge.
- Given no name and the silhouette glyph,
  when the avatar renders,
  then it shows a silhouette on the neutral tile.
