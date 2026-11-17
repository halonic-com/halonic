# spec.verifies-counts-retries-once

- Status: active
- Since: 0.1.0
- Source: HAL-6369

When a test inside `verifies(id, body)` checks inside `vi.waitFor` or `expect.poll`, the spec package shall count only the `expect` calls of the attempt that passed, of both the global `expect` and the test's own `({ expect })`, so the recorded count doesn't depend on how often it retried.

## Examples

- Given a test whose `vi.waitFor` callback calls `expect` twice and fails twice before it passes,
  when it has finished,
  then its `assertions` tag is 2.
- Given a test that calls `expect` once, then waits with an async `vi.waitFor` callback that makes three `expect` calls (two with the test's own `expect`) and fails twice before it passes,
  when it has finished,
  then its `assertions` tag is 4.
- Given a test whose `vi.waitFor` never passes and times out,
  when the `vi.waitFor` has failed,
  then the test fails with the callback's last error and the count still includes every attempt.
- Given a test whose `expect.poll` retries before it passes,
  when it has finished,
  then its `assertions` tag is 1.
