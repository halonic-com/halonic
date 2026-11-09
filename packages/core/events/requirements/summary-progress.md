# events.summary-progress

- Status: active
- Since: 0.1.0
- Source: old app `summarize` at commit 784f78d

While a run's events are folded, the events package shall track the current state, every state visited in order, the context values and how the run ended: `run.completed` sets the status "completed", the end time and the final context, and `run.failed` sets the status "failed", the end time, the error and its reason. The reason is `null` while the run hasn't failed, and when `run.failed` gives none, as in logs written before it had one.

## Examples

- Given `state.entered` "a", then "b", then "a",
  when they are summarized,
  then the state is "a" and the states visited are "a", "b", "a".
- Given `context.updated` with key "x" set to 1 and then to 2,
  when they are summarized,
  then the context is `{ x: 2 }`.
- Given `run.completed` at "T" with context `{ done: true }`,
  when it is summarized,
  then the status is "completed", `endedAt` is "T" and the context is `{ done: true }`.
- Given `run.failed` at "T" with error "boom",
  when it is summarized,
  then the status is "failed", `endedAt` is "T", the error is "boom" and the reason is `null`.
- Given `run.failed` with error "boom" and reason "budget",
  when it is summarized,
  then the reason is "budget".
- Given only `state.entered` "a",
  when it is summarized,
  then the reason is `null`.
