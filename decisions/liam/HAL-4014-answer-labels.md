# Decision: a wait step's answer labels travel with `run.waiting`

- Approval: Liam decided this on [HAL-4014](/HAL/issues/HAL-4014) (for the Inbox answer labels, HAL-4008); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-4014

## What changes

`workflow.answer-labels` is new: for a state, each event's label is the first non-empty `label` of
its transitions in file order, trimmed. Timer transitions and unlabelled events have none.

`engine.wait-state` now also says that `run.waiting` carries those labels as `labels` (event →
label), left out when no answer has one. One example is added. No example was removed or weakened.

`events.run-log-contract` lists the new optional field, `run.waiting.labels`, with its own
requirement, `events.answer-labels`: the summary holds the labels in `answerLabels` while the run
waits and `{}` otherwise. No reference field changes, so old logs read as before.

## Why

A transition already has an optional `label`, but only the event names reached `run.waiting` and the
summary. The Inbox's wait card wants the author's word on its button and in its decided line ("You
chose _Send reply_"). Writing the labels into the event at the moment the run starts waiting, as
with the description, means every reader (Inbox, `halonic run`, the run log) shows the same words,
and a later edit to the workflow file doesn't change what an old run said it was waiting for.

The first non-empty label wins, not the first transition's label, so an author can label any one of
an event's guarded transitions. A subflow's parent run doesn't pass the child's labels on yet, just as
it doesn't pass its description on; the Inbox falls back to its built-in labels there.

## Covers

- workflow.answer-labels
- engine.wait-state
- events.answer-labels
- events.run-log-contract
- packages/core/workflow/src/machine.test.ts
- packages/core/engine/src/states/wait/state.test.ts
- packages/core/events/src/run-event.test.ts
- packages/core/events/src/summarize-waiting.test.ts
