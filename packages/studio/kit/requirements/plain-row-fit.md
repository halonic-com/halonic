# kit.plain-row-fit

- Status: active
- Since: unreleased
- Source: the board's correction on HAL-10 (26 Nov): the Inbox's and the Messenger's sidebar rows are exactly 80px, padding included; Noah's decision on HAL-20018 (option B, the wait kept whole); built on `kit.plain-row-size`

In a `plain` `List`, whose rows are a sidebar's 80px rows (`kit.plain-row-size`), a row with `wrapTitle` shall show its title on at most two 20px lines and then cut it with an ellipsis, and every row's meta line shall stay on one line, with `wrapMeta` too, so its text takes at most 60px and the row stays 80px high. A one-line title shall stay centred beside the row's picture. Screen readers shall still hear the whole title and the whole meta line. A `List` that isn't `plain` shall keep wrapping as `kit.list-wrap-title` and `kit.list-wrap-meta` say.

## Examples

- Given a plain List with a row "Approve the refund for the Acme order from last week" with `wrapTitle` and `wrapMeta`,
  when it renders,
  then its title is clamped to two 20px lines, its meta line is cut on one line, and the row keeps its 80px with 10px above and below.
- Given a List that isn't plain, with the same row,
  when it renders,
  then its title wraps onto as many lines as it needs and its meta line onto two.
