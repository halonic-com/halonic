# runs.run-view.key-origin-waiting

- Status: active
- Since: unreleased
- Source: HAL-15213; UX checklist on HAL-11873, "Prompt open": the run shows "Waiting for your answer" on the step; HAL-15831 (flow check C638 #5): a later event no longer hides the wait while the question is open

While a running run's log has a `key-origin.asked` that is still open, the step the run is in shall show "Waiting for your answer" with the "needs you" mark, read as "waiting for you", at once rather than after the slow step's 2 seconds. A question shall stay open until its `key-origin.answered` for the same key and address follows, or an event shows the call may have ended without one: the step's own agent starts (an `agent.started` without `parent`), any agent finishes, or the run enters a step or starts to wait. Any other event, such as a subagent's model call or a tool call in the same step, shall leave it open. With no question open, the step shall show what it shows without the question. A run that has ended shall show no wait.

## Examples

- Given a running run in the step Draft whose log ends with `key-origin.asked`,
  when the run page is shown,
  then Draft reads "Waiting for your answer", with the "needs you" mark.
- Given the same run whose log then has `key-origin.answered` with `allowed`,
  when the run page is shown,
  then Draft reads "Running" again.
- Given the same run whose log then has a subagent's `llm.request`, before any answer,
  when the run page is shown,
  then Draft still reads "Waiting for your answer".
