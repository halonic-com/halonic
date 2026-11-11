# Decision: check a routine's target before the overlap rule

- Approval: Liam's note in his review of halonic#1580 ([HAL-4876](/HAL/issues/HAL-4876)) asked
  for this; Liam approves this note in his review of this pull request on
  [HAL-3246](/HAL/issues/HAL-3246)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:0+TbpGhWYggFRzfWN8yP/lDxRKiis3KRmVQOOO/DkpOEY2+1pUZmHOkRxGMiYd1GcsARI4OBuoFCVKfyMo0RCQ==
- Task: HAL-3246

## What changes

`app.scheduler-skip-target-unavailable` changes when the scheduler asks the host's
`targetUnavailable` check:

- **Before:** after the overlap rule, about each run the tick would start.
- **Now:** before the overlap rule, once per routine with due times that the overlap rule would
  start, about its oldest due time. When the target can't start, every due time of that routine
  in the tick is a `target-unavailable` skip. When the check throws, every one of them is
  reported as failed.

A routine whose overlap rule starts nothing this tick (a run going, and `overlap: skip` or
`queue`) isn't asked, so its times keep `busy` or stay queued, as the existing example says. A
routine with `overlap: allow` is still asked with a run going, since its times would start: a
target can go to the trash while a run is going. The unavailable and failed times are reported
oldest first across routines, as they were when they followed the sorted starts. Two examples are
added, for the catch-up case and the `allow` case, and one is reworded for "failed".

## Why

With the check after the overlap rule, a tick that found 08:00, 09:00 and 10:00 due for a routine
with `overlap: skip` started 08:00, marked 09:00 and 10:00 `busy`, then skipped 08:00 because
the target was in the trash. Nothing was running, so `busy` was wrong. With `overlap: queue`,
09:00 and 10:00 queued behind a run that never started. A routine's due times all have the same
target, so one answer covers them all, and asking first records each time with the reason that's
true.

## What doesn't change

The `why` values, the rows they make, the stored shape of a skip and the behaviour without a
check stay the same. No test is weakened: the existing tests pass unchanged, and three are
added (the catch-up case, the `allow` case from Liam's review of this pull request, and the order
across routines).

## Covers

- app.scheduler-skip-target-unavailable
