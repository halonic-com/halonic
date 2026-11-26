# inbox.row-meta-wraps

- Status: active
- Since: unreleased
- Source: HAL-15126 (C543 I3, Noah's decision); HAL-20018 (Noah's decision: one line in the Inbox's 80px rows, the wait kept whole)

The line under an item's title in Needs you on Home shall wrap onto a second line and then be cut with an ellipsis, so a long line such as "Support reply · run 891b5a · a person step · Waiting 1 h" still shows how long the item has waited. In the Inbox's own list, whose rows are 80px, it shall stay on one line, and how long the item has waited, " · Waiting 1 h", shall stay whole at its end while only the part before it is cut: "Support reply · run 891b5a · a pe… · Waiting 1 h". Its words and their order shall stay as they are.

## Examples

- Given a run of Support reply waiting at a person step for an hour,
  when you open the Inbox,
  then its row's second line is one line that ends in "Waiting 1 h", whole.
- Given the same run,
  when Home's Needs you shows it,
  then its row's second line may take two lines and ends in "Waiting 1 h".
