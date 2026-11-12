# engine.step-signal

- Status: active
- Since: 0.1.0
- Source: [HAL-4758](/HAL/issues/HAL-4758) (parity gap `step-signal-and-conversation-ignored`, found on [HAL-1541](/HAL/issues/HAL-1541))

When a `task`, `parallel`, `foreach` or `workflow` state with a `signal` finishes `done`, the engine shall record `signal.sent` with the state, the signal's name and its data, right after the events that write the state's output (its `context.updated` and, for a task state with `artifact`, its `artifact.created`) and before the transition. Each value of the data shall be rendered as a template with the run's input and its context, as the state's output leaves it, so `{{context.<output>}}` gives the output just written. A signal with no data shall send an empty object. A state whose step fails or can't be tried shall send no signal, and a state without `signal` none either.

## Examples

- Given a task state `notify` with output `note` and signal `invoice.paid` whose data is `{ vendor: "{{context.fields.vendor}}" }`, and a context whose `fields.vendor` is `Acme Paper`,
  when the agent answers `Paid Acme Paper.`,
  then the engine records `agent.finished`, `context.updated` for `note`, then `signal.sent` with `{ vendor: "Acme Paper" }`.
- Given a parallel state with a signal,
  when the first of its two branches ends,
  then the engine sends no signal; when the second ends, it sends it after the results.
- Given a task state with a signal,
  when its model call fails,
  then the run fails and no `signal.sent` is recorded.
