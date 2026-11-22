# app.run-send-payload

- Status: active
- Since: unreleased
- Source: HAL-16440 (the model-mix trials hand a waiting run data the eval harness collected, such as a diff, without a model writing it); team decision, Liam

When a caller sends an event with a payload, the run events service shall hand the payload to the engine with the event, under the same checks as a send without one (`app.run-send`), so the waiting step writes it to the run's context. A refused send shall hand the engine nothing.

## Examples

- Given run `run_a1` waiting for `approve` or `reject`,
  when `approve` is sent with the payload `{ "note": "Looks right." }`,
  then the executor gets `approve` for `run_a1` with that payload.
- Given run `run_a1` waiting at `review` for `approve` or `reject`,
  when `aprove` is sent with a payload,
  then the send is refused as `invalid_input`, and the executor gets nothing.
