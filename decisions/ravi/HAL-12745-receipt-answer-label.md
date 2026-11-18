# Decision: the receipt names a wait step's answer by its label

- Task: HAL-12745, from Liam's review of HAL-12727 (PR #3735, finding L8)
- Approval: Liam, in review of HAL-12745 (his signature is added there)
- Kind: user-visible

## What changes

- `runs.run-view.receipt-approvals`: a wait step's answer other than approve or reject is named by
  the label the step gave that event, the same words the Inbox card offered: "Review: answered
  Send to a manager by you at 10:42". An answer with no label still shows the event id ("Review:
  answered escalate by you at 10:42"). Approve and reject keep "approved" and "rejected".

## Why

`run.waiting` already carries the step's `labels` (requirement `events.answer-labels`), and the
Inbox card shows them. Showing the raw event id on the receipt named the same answer two ways.
Nothing is removed: a log without labels reads as before, and the code is in the same pull
request.

## Covers

- runs.run-view.receipt-approvals
