# kit.list-wrap-title

- Status: active
- Since: unreleased
- Source: HAL-13305 (C163 H2b)

When a row of the kit's `List` without `columns` has `wrapTitle`, its title shall wrap onto as many lines as it needs, between words and inside a word too long for the row, instead of being cut with an ellipsis, and the row shall grow to hold it, with at least 8px above and below its text. Its meta line shall stay one line cut with an ellipsis, and its trailing chip shall stay at the right. A row without `wrapTitle` shall cut its title as before.

## Examples

- Given a row "Support reply · run 2ff090" with `wrapTitle`, a meta line and a trailing chip,
  when it renders,
  then its title wraps instead of being cut, its meta line is cut with an ellipsis and the chip is on the right.
- Given a row without `wrapTitle`,
  when it renders,
  then its title is cut with an ellipsis.
