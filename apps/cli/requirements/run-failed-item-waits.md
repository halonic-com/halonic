# cli.run-failed-item-waits

- Status: active
- Since: unreleased
- Source: HAL-15555 (a typed cause for an item's run that waits, decided by Liam on the task; the words follow C613's for `validate`'s `foreach-child-waits`, a team decision under HAL-2282); HAL-15813 (C633 row 58: line 2 says the command as the next step)

When a run failed with the failure `item-run-waits` (`app.run-failure-item-waits`), the CLI shall say on line 1 "<workflow> failed in the step <step>: the run it started for item <n> waited, and a run for one item can't wait.", with the item counted from 1, and on line 2 "Move the wait step in <item workflow> into this workflow after <step>, or take it out of <item workflow>. To see which step it is, run halonic validate.", with the user's own `--dir`. Neither line shall say Halonic can't tell the cause, or ask for a report.

## Examples

- Given Review all, whose for-each step Each runs review-one for each item, and a run that failed because the run for item 2 waited,
  when the CLI words its failure with `--dir ./acme`,
  then line 1 is "Review all failed in the step Each: the run it started for item 2 waited, and a run for one item can't wait."
  and line 2 is "Move the wait step in review-one into this workflow after Each, or take it out of review-one. To see which step it is, run halonic validate --dir ./acme."
