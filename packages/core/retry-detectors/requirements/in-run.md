# retry-detectors.in-run

- Status: active
- Since: unreleased
- Source: HAL-17088, step 1 of HAL-17073; board, 23 Nov (early hedge); variant-router `hedge_sim.py`, `checkpoints.tags_at` and REPORT.md "Keep-best and early-hedge"

The retry detectors package shall score a running writer attempt at minute 3, 6 or 10 without a model call, from only the steps at or before that minute: turns so far, seconds so far, shell calls, whether and when it first edited, files edited, the most edits and reads of one file, seconds since the last edit, test and typecheck runs, the failures of the last test run and their trend since the first, test files edited (and those that existed at the base commit), whether a snapshot was edited, and the turns' input and output tokens. A tag with no value yet shall be -1. It shall return the probability that the attempt fails and whether that is above the model's threshold, with one model per checkpoint in the same data file as the end-of-run model.

## Examples

- Given an attempt whose first edit is at 150 seconds and whose first test runs at 200 seconds,
  when it is tagged at minute 3,
  then it has edited, its first edit is at 150 and its last test failures are -1.
- Given its test runs failed 3, then 1 tests by minute 6,
  then the last failures are 1 and the trend is -2.
