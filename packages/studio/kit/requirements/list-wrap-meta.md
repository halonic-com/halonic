# kit.list-wrap-meta

- Status: active
- Since: unreleased
- Source: HAL-15126 (C543 I3); HAL-20018 (a `plain` List keeps one line, `kit.plain-row-fit`)

When a row of the kit's `List` without `columns` has `wrapMeta`, its meta line shall wrap onto a second line, between words and inside a word too long for the row, and shall be cut with an ellipsis at the end of the second line, and the row shall grow to hold it, with at least 8px above and below its text. The meta line's screen-reader-only words shall stay inside the line, so they don't widen the page. A row without `wrapMeta` shall keep its meta line on one line as before, and so shall a row in a `plain` List (`kit.plain-row-fit`).

## Examples

- Given a row "Approve this reply?" with `wrapMeta` and the meta line "Support reply · run 891b5a · a person step · Waiting 1 h",
  when it renders,
  then its meta line takes up to two lines, then is cut, and the row grows to hold it.
- Given a row without `wrapMeta`,
  when it renders,
  then its meta line is cut with an ellipsis on one line.
