# Decision: an open start card can't start the run while the sandbox can't start

- Task: HAL-4291 (point 4 of the CTO's review: the Run dock already open)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-4291 (the CTO's review, point 4: close the dock or make its Start unavailable too when the check refuses)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:i/rxVk2NkeKDiIGrHqwNuQdoxLrukwV2+VVapOaTPDHQzysVPk8SQdDK2Fch/OTqb/q1gQaqYpZSuXpqWkNyDw==

## What changes

`workflows.page.cant-run` gains one sentence and one example: when the start card is already
open as the check refuses, its **Start run** is unavailable the same way as **Run**, described by
the same first line, and the card keeps its input.

Nothing the requirement promised before is taken away.

## Why

A person can open the start card while the check is still running. Until now its **Start run**
stayed available after the check refused. The engine still refused the run, so nothing ran
without the sandbox, but the card offered a start that couldn't work. Of the two ways the review
allowed, the card stays open with **Start run** unavailable rather than closing, so the input the
person typed isn't lost and the Callout above it says what to fix.

## Tests

No test was weakened or skipped. The new case has its own test in
`packages/studio/features/workflows/src/page/cant-run.test.tsx`.

## Covers

- workflows.page.cant-run
