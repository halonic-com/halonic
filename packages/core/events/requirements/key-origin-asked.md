# events.key-origin-asked

- Status: active
- Since: unreleased
- Source: HAL-15213 (UX checklist on HAL-11873, "Prompt open": the run shows "Waiting for your answer" on the step)

The run log shall have a `key-origin.asked` event when a person is asked whether a run's model call may send a stored key to an address that isn't on that key's list, written before the question is shown, with the provider's name in `provider`, the key's name in `key` and the address in `origin`. It shall never hold the key's value. The person's answer shall follow as `key-origin.answered` (requirement `events.key-origin-answered`); a wait that ends without an answer shall add nothing.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `key-origin.asked` is among them, with `provider`, `key` and `origin`.
- Given a `key-origin.asked` event,
  when its fields are checked,
  then it has no field for the key's value.
