# spec.wait-until-checks-once

- Status: active
- Since: unreleased
- Source: HAL-9816

When a test calls `waitUntil(waitingFor, ready)`, the spec package shall keep calling `ready` every 10 milliseconds until it returns true, and shall make no `expect` call itself. If `ready` is still false after the timeout (4 000 milliseconds unless the test sets one), then the spec package shall throw an error that gives the timeout and says what the test waited for.

## Examples

- Given a `ready` that turns true after 30 milliseconds,
  when a test waits for it,
  then `waitUntil` returns after that and the test's `expect` count is unchanged.
- Given a `ready` that is already true,
  when a test waits for it,
  then `ready` is called once and `waitUntil` does not pause.
- Given a `ready` that returns a promise,
  when a test waits for it,
  then `waitUntil` waits for the promise before it decides.
- Given a `ready` that never turns true and the timeout 100 milliseconds,
  when a test waits for "the listener to be called",
  then `waitUntil` throws "Timed out after 100 ms waiting for the listener to be called."
- Given a `ready` that never turns true and no timeout,
  when a test waits for it,
  then `waitUntil` throws after 4 000 milliseconds.
