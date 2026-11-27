# Decision: Paperclip question cards keep "Other" and free-text options

- Approval: /HAL/issues/HAL-20735 (plan for HAL-20648, approved by Liam)
- Kind: user-visible
- Signature:

Paperclip asks `ask_user_questions` questions with `allowOther: true` or
options with `freeText: true`, and takes the written answer back as
`otherText`. `paperclip-client.question-cards` dropped both, so the Studio
showed no "Other" choice and no text field.

The requirement now keeps both flags, and maps a card with one single-select
question that takes a written answer to `questions` instead of plain
`options`, since plain options have no text field. It builds on the port's
`ports.agent-messaging-questions` (decision note
`elena/HAL-20648-question-other.md`).

Nothing is weakened: every card mapped before maps the same way, unless
Paperclip marked it for a written answer.

## Covers

- paperclip-client.question-cards
