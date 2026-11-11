# spec.verifies-counts-retries-once

- Status: active
- Since: 0.1.0
- Source: HAL-6369

When a test inside `verifies(id, body)` checks inside `vi.waitFor` or `expect.poll`, the spec package shall count only the `expect` calls of the attempt that passed, so the recorded count doesn't depend on how often it retried.

## Examples

- Given a test whose `vi.waitFor` callback calls `expect` twice and fails twice before it passes,
  when it has finished,
  then its `assertions` tag is 2.
- Given a test whose `vi.waitFor` callback is async and fails twice before it passes,
  when it has finished,
  then its `assertions` tag counts the calls of the passing attempt only.
- Given a test whose `expect.poll` retries before it passes,
  when it has finished,
  then its `assertions` tag is 1.
