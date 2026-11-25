# Decision: an item with questions may also offer whole-item options

- Task: HAL-18871
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18871 (Liam approved the three port proposals, 25 Nov)
- Kind: internal

## What changes

`ports.agent-messaging-questions` said an item with `questions` takes only an `answers` answer and has empty
`options`. Paperclip's checkbox and task-suggestion cards are accepted with the picks and rejected as a whole,
often with a required reason. So an item with `questions` may now also offer whole-item `options`, such as
Reject, and takes an option answer naming one of them. An option can say it needs a note
(`noteRequired`), and a question can suggest `preselected` options. The requirement's wording changes to say
so; its examples gain two. No test was weakened or skipped: the existing test that an item with
questions refuses an option it doesn't offer still holds.

A new requirement, `ports.agent-messaging-answer-elsewhere`, adds `InboxItem.answerElsewhere`.

## Why

No dead cards in Inbox and Messenger (board ask, HAL-18861). Liam approved the three fields on HAL-18871.

## Covers

- ports.agent-messaging-questions
