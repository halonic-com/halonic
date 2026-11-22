# Decision: the meter records every top-level run's end, once

- Requirements: `engine.meter-checks` (widened)
- Task: HAL-16545
- Approval: HAL-16545, from the CTO's review of #5298 on HAL-16241
- Kind: internal

## What changes

`engine.meter-checks` said the engine records a top-level run's end when a step has just ended
it. A run that ends another way never reached the meter: a cancelled run, a run the sweep of lost
runs ends as interrupted, a run whose kept effects end it on a later timer, and a run with an
effect the executor can't carry out. The requirement now says the end is recorded whichever way
the run ended, and once: a cancel of a run that had already ended records nothing.

The recording moved into the code every ending goes through (`RunEnds.ended`), and the cancel
passes on whether it ended the run itself.

## Why

A meter that sells runs has to see every run's end, or a cap such as `plan.concurrency` keeps
counting runs that are over. It must see each end only once, or it counts a run twice.

## Tests

The requirement gains two examples, a run cancelled twice and a run the next engine ends as
interrupted, each with its test in `packages/core/engine/src/run/local-runs-meter.test.ts`. The
existing tests are unchanged, apart from the fixture's spent run, which is now an ended run, so
the sweep of lost runs leaves it alone. No test or `expect` call was removed.

## Covers

- engine.meter-checks
