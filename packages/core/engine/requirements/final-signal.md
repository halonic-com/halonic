# engine.final-signal

- Status: active
- Since: unreleased
- Source: HAL-14310, PR 1 of the signal-routine plan on HAL-14305

When a run enters a `final` state with a `signal`, the engine shall record `signal.sent` with the state, the signal's name and its data before `run.completed`, so `run.completed` stays the run's last event. Each value of the data shall be rendered as a template with the run's input and its context as the run ends, in the same way as a `task` state's signal (`engine.step-signal`). A signal with no data shall send an empty object, and a `final` state without `signal` shall send none.

## Examples

- Given a final state `sent` with signal `reply.sent` whose data is `{ to: "{{input.from}}", reply: "{{context.reply}}" }`, and a run with input `from: support` that wrote `reply: "On its way"`,
  when the run enters `sent`,
  then the engine records `signal.sent` with `{ to: "support", reply: "On its way" }`, then `run.completed`, and the run summary lists the signal.
- Given a final state without a signal,
  when the run enters it,
  then `run.completed` follows `state.entered` and no `signal.sent` is recorded.
