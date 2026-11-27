# Decision: read Paperclip's multi-select questions as `"multi"`

- Approval: HAL-20647
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:SD7Q91KNutKWHsu/pclplm3FB2tP5pbR+nvmxX1Jb2yCgeDQ851pOq5/Q7cK0BMCmN7XUkZ50j5ZGs+oVibiAw==

`paperclip-client.question-cards` named the wire value `selectionMode: "multiple"`, but Paperclip
sends `"multi"` for a multi-select question (`askUserQuestionsQuestionSchema` in 2026.1117.0, the
version the click test pins; a question set's `answerMode: "multi_select"` is stored as `"multi"`
too). Every multi-select question reached Halonic as single-select, so the person could pick only
one option.

## Covers

- paperclip-client.question-cards
- packages/adapters/paperclip-client/src/card-questions.test.ts

## What changes

- The requirement names `selectionMode: "multi"` instead of `"multiple"`. Nothing else in it changes.
- The test's multi-select fixture question uses `"multi"`, the value Paperclip sends. The test makes
  the same `expect` calls; it failed against the old code and passes with the fix.
- `"multiple"` is no longer read as multi-select: no Paperclip version is known to send it.

## Why

The requirement described a wire value Paperclip never sends, so the code built to it never
matched a real card.
