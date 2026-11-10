# inbox.items

- Status: active
- Since: 0.1.0
- Source: HAL-1218; [ux-checklists-approvals](/HAL/issues/HAL-1250#document-ux-checklists-approvals) 2.1, 2.4 and 2.6; [ux-checklists](/HAL/issues/HAL-1069#document-ux-checklists) 2.8; Liam's decision on the wait step's description (HAL-2560)

The Inbox shall list what waits for you in the runs it is given, newest first: one item for each tool call a run waits on your OK for, named by its run and its call id, with the agent, the tool, the connector it comes from, the arguments and when it was asked; and one item for each run waiting at a `wait` step, with the step's description as core filled it in (its first line as the title, else the step's id with a capital first letter, and the rest as the body), the answers the step takes and when its timer moves it on. A run that waits on its child run, a run at a `wait` step that takes no answer (only timers), a run that isn't waiting and a test run have no item.

## Examples

- Given a run waiting on two tool calls, `call-1` asked at 10:42 and `call-2` at 10:43,
  when the Inbox lists it,
  then it has two items, `call-2` first.
- Given a tool call to `notes-mcp__create_note`,
  when the Inbox lists it,
  then the item's tool is `create_note` and its connector is `notes-mcp`; a call to `search` has the connector `null`, and so has a call to `__search`.
- Given Acme's run waiting at `review` with the title "Approve this reply?" and the reply as the body,
  when the Inbox lists it,
  then the item's title is "Approve this reply?", its body is the reply and it takes `approve` and `reject`.
- Given a run waiting at a `wait` step without a description,
  when the Inbox lists it,
  then the item's title is the step's id with a capital first letter.
- Given a run waiting on its child run, a running run, a completed run and a waiting test run,
  when the Inbox lists them,
  then it has no items.
- Given a run waiting at a `wait` step that has only a timer and takes no answer,
  when the Inbox lists it,
  then it has no item: nobody can answer it, and the timer moves it on.
