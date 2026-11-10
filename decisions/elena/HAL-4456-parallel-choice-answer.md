# Decision: a parallel branch and a for-each item check a choice answer too

- Approval: [HAL-4456](/HAL/issues/HAL-4456), which asks for this; the package owner approves this note in review
- Kind: internal
- Task: HAL-4456

## What changes

`engine.task-choice-answer` covered only plain `task` states. It now also covers a `parallel`
branch and a `foreach` item whose agent's output is a `choice`, with two new examples. A branch
whose answer is none of the options ends as a failed branch with the reason
`answer-not-an-option`, so `join` and `continueOnError` decide what happens next, as for any
failed branch. An item whose answer is none of them fails the run, as a failed item call already
does. A matching answer keeps the option itself, with the whitespace trimmed, as in a task state.

`engine.parallel-state` names the new way a branch can fail in its sentence on failed branches.

## Why

Porting the old test-runner tests (HAL-4448) showed that a branch took any answer, where the old
engine failed the step and a plain `task` state fails the run. A `choice` agent's answer is used
to pick a transition or fill a field, so an answer that isn't an option must never pass silently,
wherever the agent runs. No outcome the requirements already described changes: agents whose
output isn't a `choice` keep their answers as they are.

## Covers

- engine.task-choice-answer
- engine.parallel-state
