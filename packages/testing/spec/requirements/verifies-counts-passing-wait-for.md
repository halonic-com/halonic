# spec.verifies-counts-passing-wait-for

- Status: active
- Since: 0.1.0
- Source: HAL-6239

When a test inside `verifies(id, body)` calls `expect` inside a `vi.waitFor` callback, the spec package shall count only the `expect` calls of the attempt that passed, so the recorded count doesn't depend on how often the callback had to retry.

## Examples

- Given a test whose `vi.waitFor` callback calls `expect` once and passes on the third attempt,
  when it has finished,
  then its `assertions` tag is 1.
- Given a test whose `vi.waitFor` callback calls its own `({ expect })` once and passes on the second attempt,
  when it has finished,
  then its `assertions` tag is 1.
- Given a test that called `vi.waitFor` inside `verifies`,
  when a test outside `verifies` runs,
  then `vi.waitFor` is Vitest's own again.
