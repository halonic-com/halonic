# spec.verifies-counts-passing-wait-attempt

- Status: active
- Since: 0.1.0
- Source: HAL-6258

When a test inside `verifies(id, body)` waits with `vi.waitFor`, the spec package shall count only the `expect` calls of the attempt that passed, so the recorded count doesn't depend on how often the wait retried.

## Examples

- Given a test whose `vi.waitFor` callback calls `expect` once and fails twice before it passes,
  when it has finished,
  then its `assertions` tag is 1.
- Given the same wait with an async callback that uses the test's own `({ expect })`,
  when it has finished,
  then its `assertions` tag is 1.
