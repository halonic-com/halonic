# runs.run-view.item-waits-banner

- Status: active
- Since: unreleased
- Source: HAL-15555 (the cause `workflow.item-run-waits`, decided by Liam on the task; the CLI's two lines of `cli.run-failed-item-waits`, after C613's words for `validate`'s `foreach-child-waits`, a team decision under HAL-2282, with Nina's check on the pull request)

When a run failed because the run its for-each step started for one item waited (`app.run-failure-item-waits`), the run page's danger banner shall say "*Review all* failed in the step *Each*: the run it started for item *2* waited, and a run for one item can't wait.", with the item counted from 1, then "Move the wait step in *review-one* into this workflow after *Each*, or take it out of *review-one*.", with **See the step**, as the other causes fixed in the workflow do (`runs.run-view.failure-banners`). It shall not say Halonic can't tell the cause. A cause that doesn't name the item's workflow or the item keeps the general banner.

## Examples

- Given Review all, whose for-each step Each runs review-one for each item, and a run that failed because the run for item 2 waited,
  when its page is shown,
  then the banner reads "Review all failed in the step Each: the run it started for item 2 waited, and a run for one item can't wait.", then "Move the wait step in review-one into this workflow after Each, or take it out of review-one.", with **See the step**.
