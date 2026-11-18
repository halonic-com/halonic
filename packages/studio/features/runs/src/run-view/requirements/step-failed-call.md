# runs.run-view.step-failed-call

- Status: active
- Since: unreleased
- Source: HAL-12415 option (a), decided by the team (Chief with Sofia, 18 Nov) under HAL-2282; ux check HAL-12390 C7 and rule E1; microcopy (HAL-751) revision 113, 1.6, E1, E3 and E4

When a step's tool call has a `tool.result` whose `outcome` is `error` or `unknown`, the step panel (`runs.run-view.step-events`) shall show one quiet line under that call, outside its folded arguments, starting with a ✕ that a screen reader doesn't hear:

- outcome `unknown`: "✕ Didn't work: the tool `create_note` (*notes-mcp*) broke off without an answer, so it may or may not have done its work.", the engine's own words for that outcome;
- outcome `error`: "✕ Didn't work.", because the log gives its reason only as free text.

The connector in brackets shall come from the event the engine logs right before the call, `connector.started` or a `tool.unasked` for the same tool; without one the brackets are left out. The line shall never show the result's text, which is the tool's or the engine's own words (E3). A call whose outcome is `ok`, a call from an older log without `outcome`, and a call that has no result yet shall have no line. A `tool.result` finds its call the way the timeline does (`entryOf`), so of two calls to the same tool, only the one that failed has the line.

Limits, for the docs: the log has no typed cause for a failed call yet, so the line can't say "didn't answer within 60 seconds" for a call that took too long, or name the program or secret a connector missed; both read as the `unknown` or `error` line until the engine logs a cause.

## Examples

- Given step Draft's call to `create_note` on the connector notes-mcp broke off without an answer,
  when the person opens Draft's entry,
  then under `create_note` the panel reads "✕ Didn't work: the tool `create_note` (*notes-mcp*) broke off without an answer, so it may or may not have done its work.".
- Given a call to `search_pages` failed with the outcome `error`,
  when the person opens its step,
  then under `search_pages` the panel reads "✕ Didn't work." and nothing of the tool's own error text.
- Given a call to `send_email` that worked,
  when the person opens its step,
  then nothing shows under `send_email`.
