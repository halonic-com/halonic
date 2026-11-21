# Decision: Every step names a wait step's answer by its label too

- Task: HAL-15090, from Sofia's UX check C539 (HAL-15073, points R2 and R3)
- Approval: decided by the team on HAL-15090, following the HAL-12745 decision (wording on an approved screen). Liam signs on review.
- Kind: user-visible

## What changes

- `runs.every-step`: a wait step's line names an answer other than approve or reject by the label
  the step gave that event, as the receipt's Approvals already does (HAL-12745): "You answered
  Send to a manager at 10:44". An answer with no label still shows the event's id. Approve and
  reject keep "You approved" and "You rejected".
- `app.run-steps`: an answered step carries the label its wait step gave that answer, when the step
  gave one of its own, so Every step reads it from the app like the rest of the step.
- Both Every step and the receipt now read only the step's own labels (`Object.hasOwn`, as the
  Inbox's wait card does). An event named `constructor` or `toString` used to find an
  `Object.prototype` member, and the receipt printed a function's source; it now shows the event's
  id. Regression test in `receipt-model-answers.test.ts`.

## Why

The HAL-12745 note covers only `runs.run-view.receipt-approvals`, so the run page named the same
answer two ways: "Review: answered Send to a manager" in Approvals and "You answered escalate" in
Every step. Nothing is removed: a log without labels reads as before, and no test is weakened.

## Covers

- app.run-steps
- runs.every-step
