# Decision: a lower live-cloud run without a runner doesn't hold up the others

- Requirement: `check.live-turn` (`tooling/check/requirements/live-turn.md`)
- Task: HAL-14523, follow-ups from Ravi's review of #4080 (HAL-13840)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14523 (Liam reviews and signs; Julian wrote it, Mateo carries it)
- Kind: internal

## What changes

- `check.live-turn` no longer waits for every unfinished run with a lower ID. A lower run counts
  as ahead only once its `live-cloud` job is in progress (it has a runner) and is waiting its
  turn. A lower run still planning, or whose `live-cloud` job is queued for a runner, doesn't
  hold up a run that already has one; when it starts, it waits for that run like any other.
  `runStanding` splits the old `before` into `unstarted` and `waiting`.
- The requirement says so, adds an example for it, and says that a holder cancelled mid-suites
  (job `completed`, suites step still `in_progress`) holds nobody up, as the code already did.
- In `tooling/check/src/cli/live-turn.test.ts`, the test that waited for a lower run still
  planning now waits for a lower run waiting its turn. New tests cover a lower run without a
  runner and a holder cancelled mid-suites. No assertion is dropped.
- `docs/guides/checks.md` says the order is among the runs that have a runner.

## Why

Under a runner backlog, a lower-ID run whose `plan` or `live-cloud` job sat in the queue for a
runner counted as ahead, so runs that already had a runner waited for it, up to 45 minutes, and
held their runners idle. Ravi found this in the review of #4080.

What it costs: two runs can now overlap for a few seconds, when a lower run gets its runner just
as a higher run decides to go and before GitHub shows that run past its wait step. The worst
case is the D1 load from before #4080, for one pair of runs, and the 45-minute cap is unchanged.
No run can wait for another forever: among the runs that have a runner, the lowest still goes
first.

## Covers

- check.live-turn
- tooling/check/
