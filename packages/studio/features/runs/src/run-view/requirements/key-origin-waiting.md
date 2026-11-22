# runs.run-view.key-origin-waiting

- Status: active
- Since: unreleased
- Source: HAL-15213; UX checklist on HAL-11873, "Prompt open": the run shows "Waiting for your answer" on the step

While a running run's log ends with `key-origin.asked`, the step the run is in shall show "Waiting for your answer" with the "needs you" mark, read as "waiting for you", at once rather than after the slow step's 2 seconds. Once any event follows, such as the answer or the call's failure after a wait that ended without one, the step shall show what it shows without the question. A run that has ended shall show no wait.

## Examples

- Given a running run in the step Draft whose log ends with `key-origin.asked`,
  when the run page is shown,
  then Draft reads "Waiting for your answer", with the "needs you" mark.
- Given the same run whose log then has `key-origin.answered` with `allowed`,
  when the run page is shown,
  then Draft reads "Running" again.
