# app.run-failure-key-origin

- Status: active
- Since: unreleased
- Source: HAL-15330 (from C558 on HAL-15310: a run refused because its key may not go to its provider's address said Halonic can't tell the cause; a team decision under HAL-2282)

An `error` whose cause is `models.key-origin-not-allowed` with the provider, the key's name and the address shall be `key-origin-not-allowed` with all three, and the cause shall count as setup, so a client can treat the run by the cause's own kind. A cause that misses one of them shall be `error` with the engine's own message.

## Examples

- Given a run that failed with `error` and the cause `models.key-origin-not-allowed` for the provider `gateway`, the key `fake-key` and the address `https://other.example.com`,
  when its facts are read,
  then they are `key-origin-not-allowed` with those three, and the cause counts as setup.
- Given the same cause without the address,
  when its facts are read,
  then they are `error` with the engine's own message, and the cause doesn't count as setup.
