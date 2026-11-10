# Decision: a run fails when a choice answer isn't one of the options

- Approval: Elena's decision on [HAL-3375](/HAL/issues/HAL-3375), a team decision with no board
  approval needed; the maintainer approves this note in review
- Kind: user-visible
- Task: HAL-3379

## What changes

`RunFailureReason` gains `answer-not-an-option`, with its own requirement
(`events.run-failed-answer-not-an-option`). The main sentence of `events.run-failed-reason` names
it next to the other reasons added since. Nothing it promised before is taken away: every reason
means what it meant, and logs without `reason` read as before.

## Why

An agent's `choice` output promised that the reply is one of its options, but nothing checked it,
so a reply such as "This is a refund." went into the context as is. The engine now checks it and
fails the step with its own reason, so Studio and the CLI can say why.

No test was weakened. The exact-list type test in `run-failure.test.ts` now has twelve reasons.

## Covers

- events.run-failed-reason
