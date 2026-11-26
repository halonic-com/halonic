# kit.author-line-header

- Status: active
- Since: unreleased
- Source: Sofia's Studio and Messenger alignment proposal on HAL-19755 (26 Nov), PR 3: Team's PR header uses the author line with the 40px avatar; built on HAL-19765

Where an `AuthorLine` is given the header size, it shall draw its avatar at the `Avatar`'s 40px header size. Where it is given no time, it shall show the name alone, with no dot after it.

## Examples

- Given the name "Ravi" and the header size,
  when the line renders,
  then its avatar tile is 40px.
- Given the name "Ravi" and no time,
  when the line renders,
  then it reads "Ravi" with no "·".
