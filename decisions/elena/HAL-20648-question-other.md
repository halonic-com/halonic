# Decision: a question can take a written answer ("Other" or a free-text option)

- Approval: /HAL/issues/HAL-20735 (plan for HAL-20648, approved by Liam)
- Kind: user-visible
- Signature:

Paperclip asks questions with `allowOther: true` (an extra "Other" choice)
or options with `freeText: true`, and takes the written answer back as one
`otherText` per question. `ports.agent-messaging-questions` said a required
question is answered only by at least one option, so an "Other" answer with
no option could never fit.

The requirement now adds `allowOther` on a question and `freeText` on its
options, and says when an answer's `text` fits. A required question also
counts as answered by "Other" text that isn't blank. Since `otherText` can't
say which choice it belongs to, a question takes at most one written-text
choice. Items with `questions` may now also be ones answered in writing.

Nothing is weakened: every answer that fitted before still fits, since the
new rules apply only to questions that use the new fields. Text on a question
with neither stays its source's own note, as a verdict card's reason is today.

## Covers

- ports.agent-messaging-questions
