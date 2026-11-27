# kit.list-column

- Status: active
- Since: unreleased
- Source: HAL-20769 (one list-column size for every new-design screen, decided by Liam); build plan HAL-20617, P3

The kit shall give every new-design screen's list column one size, `listColumnClass`: 34% of the room the column sits in, at most 380px and at least 208px.

## Examples

- Given a list column in a 900px window beside Studio's 264px sidebar,
  when it renders,
  then it is 216px wide, 34% of the 636px left.
- Given a list column in a 500px dialog,
  when it renders,
  then it is 208px wide, not 170px.
- Given a list column in a 1,400px window,
  when it renders,
  then it is 380px wide.
