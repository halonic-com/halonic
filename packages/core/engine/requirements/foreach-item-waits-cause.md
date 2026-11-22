# engine.foreach-item-waits-cause

- Status: active
- Since: unreleased
- Source: HAL-15555 (a typed cause for an item's run that waits, so its line can say so plainly, decided by Liam on the task)

When an item's child run of a `foreach` state waits, the engine shall fail the run, as `engine.foreach-workflow-items` says, with the cause `workflow.item-run-waits` of kind `invalid_input`, whose detail names the item's `workflow` and its 0-based `item`.

## Examples

- Given a run whose for-each step `greet` runs `reply` for each item,
  when the child run of item 0 waits for approve or reject,
  then the run fails with the cause `workflow.item-run-waits` and the detail `{ workflow: "reply", item: "0" }`.
