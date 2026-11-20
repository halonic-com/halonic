# check.live-turn

- Status: active
- Since: unreleased
- Source: HAL-13840, HAL-14523

When a live-cloud run is about to run the live suites, `live-turn` shall wait while another run of the workflow holds the test account (its `live-cloud` job is past the `Wait for the account` step and its `Run the live suites` step hasn't finished), or while a run with a lower run ID is waiting its turn (its `live-cloud` job is in progress but not past the wait), so that runs use the account one at a time, oldest first, and none is cancelled. A lower run whose `live-cloud` job has no runner yet (still planning, or queued) shall not hold up a run that has one. A run whose `live-cloud` job finished, cancelled mid-suites included, shall not hold anyone up. It shall look again every 2 minutes, and after 45 minutes it shall go ahead anyway with a warning naming the runs it waited for. If it can't read the runs from GitHub, it shall go ahead at once with a warning that gives the error, so the wait never fails a run.

## Examples

- Given no other unfinished run, then it goes ahead at once.
- Given run 7 holding the account and this run is 5, then run 5 waits for run 7.
- Given run 3 waiting its turn and this run is 5, then run 5 waits for run 3; run 3 doesn't wait for run 5.
- Given run 3 still planning, or its live job queued for a runner, and this run is 5, then run 5 goes ahead; once run 3 starts, it waits for run 5.
- Given run 3 whose live job finished, was cancelled mid-suites, or whose suites finished and which is only sweeping, then run 5 doesn't wait for it.
- Given run 3 still holding the account after 45 minutes, then run 5 goes ahead with a warning naming run 3.
- Given run 3 seen done and then re-run as a new attempt, then run 5 waits for the new attempt like any other run.
- Given GitHub answers 403 while run 5 waits, then run 5 goes ahead with a warning giving the 403.
