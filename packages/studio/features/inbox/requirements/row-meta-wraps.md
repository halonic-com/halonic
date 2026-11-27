# inbox.row-meta-wraps

- Status: active
- Since: unreleased
- Source: HAL-15126 (C543 I3, Noah's decision); HAL-20018 (Noah's decision: one line in the Inbox's 80px rows, the wait kept whole); the board-approved HAL-19192 sketches as Sofia's design check on HAL-20395 read them (task HAL-20396)

The line under an item's title in Needs you on Home shall wrap onto a second line and then be cut with an ellipsis, such as "Support reply · run 891b5a · a person step". In the Inbox's own list, whose rows are 80px, it shall stay on one line, cut with an ellipsis: "Support reply · run 891b5a · a pe…". In both, how long the item has waited stays whole at the row's top right, outside the line (`inbox.waiting-time`). Its words and their order shall stay as they are.

## Examples

- Given a run of Support reply waiting at a person step for an hour,
  when you open the Inbox,
  then its row's second line is one line, "Support reply · run 891b5a · a person step", and "1 h" is whole at its top right.
- Given the same run,
  when Home's Needs you shows it,
  then its row's second line may take two lines, and "1 h" is at its end.
