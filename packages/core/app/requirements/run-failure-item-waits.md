# app.run-failure-item-waits

- Status: active
- Since: unreleased
- Source: HAL-15555 (a typed cause for an item's run that waits, decided by Liam on the task)

When a run failed with `error` and the cause `workflow.item-run-waits` (`engine.foreach-item-waits-cause`), the app shall give the failure `item-run-waits` with the item's workflow and its 0-based item from the cause's detail, and the cause shall count as the workspace's setup, as the other workflow causes of `app.run-failure` do. A cause without the workflow, or without an item that is a whole number of 0 or more, shall give the general failure with the engine's message.

## Examples

- Given a run that failed with `error` and the cause `workflow.item-run-waits` for the workflow `review-one` and the item `1`,
  when the app gives its failure,
  then it is `item-run-waits` with `review-one` and 1, and the cause counts as the workspace's setup.
- Given the same cause without the item,
  when the app gives its failure,
  then it is the general failure with the engine's message.
