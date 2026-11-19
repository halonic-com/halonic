# check.live-turn

- Status: active
- Since: unreleased
- Source: HAL-13840

When a live-cloud run is about to run the live suites, `live-turn` shall wait while another run of the workflow holds the test account (its `live-cloud` job is past the `Wait for the account` step and its `Run the live suites` step hasn't finished), or while an unfinished run with a lower run ID hasn't finished its suites, so that runs use the account one at a time, oldest first, and none is cancelled. It shall look again once a minute, and after 45 minutes it shall go ahead anyway with a warning naming the runs it waited for.

## Examples

- Given no other unfinished run, then it goes ahead at once.
- Given run 7 holding the account and this run is 5, then run 5 waits for run 7.
- Given run 3 still planning and this run is 5, then run 5 waits for run 3; run 3 doesn't wait for run 5.
- Given run 3 whose live job finished, or whose suites finished and which is only sweeping, then run 5 doesn't wait for it.
- Given run 3 still holding the account after 45 minutes, then run 5 goes ahead with a warning naming run 3.
