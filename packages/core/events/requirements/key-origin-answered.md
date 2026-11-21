# events.key-origin-answered

- Status: active
- Since: unreleased
- Source: HAL-11873 (Studio's "Allow this address?" prompt, step B c of HAL-11343)

The run log shall have a `key-origin.answered` event when a person answers whether a run's model call may send a stored key to an address that isn't on that key's list, with the provider's name in `provider`, the key's name in `key`, the address in `origin` and the answer in `answer`, either `allowed` or `not-allowed`. It shall never hold the key's value. A wait that ends without an answer, because the run was stopped or the wait timed out, shall write none.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `key-origin.answered` is among them, with `provider`, `key`, `origin` and `answer`.
- Given a `key-origin.answered` event whose `answer` is `timed-out`,
  when its type is checked,
  then it is not a valid run event.
