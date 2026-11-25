# paperclip.signal-task-effort

- Status: active
- Since: unreleased
- Source: HAL-18196 (plan HAL-17450 rev 5, "Step 2"; split from HAL-17980)

The `task-effort` signal rule shall work out the task effort handler's actions from a compact JSON input (time only from `now`, the settings, and per changed task its event, effort, labels, assignee, what the handler kept before and whether it was created, sent back or sits with a reviewer) and give the same outcome as `paperclip.task-effort-rules` and `paperclip.task-effort-guard`: a report of an effort change the handler didn't make, then either the effort to set (`low`, `high`, or none to take its own off) with the record to keep once written and the one to keep when it isn't, or the record to keep. It shall run at `high` from the difficulty in `highFrom` (default 4) and, when `highAfterSendBack` is on (the default), after a send-back, and shall never set `medium`, `xhigh` or `max`, nor write on a task whose effort someone else set.

## Examples

- Given every label set of the effort table's tests, with each record (none, empty, its own low, its own high after a send-back, hands off), each effort (none, low, high, max), each event (created, changed, sent back, with a reviewer) and with or without an agent, when the handler and the rule decide, then their actions are equal, and between them they set high, low and none, report a foreign change and keep a record.
- Given `highFrom: 3` and `highAfterSendBack: false`, when a new D3 task and a D2 task sent back are decided, then the first runs at high and the second at low.
