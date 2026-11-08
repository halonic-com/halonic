# spec.verifies-counts-assertions

- Status: active
- Since: 0.1.0
- Source: HAL-118

When a test inside `verifies(id, body)` has finished, the spec package shall record in the test's tag how many `expect` calls it made, counting both the global `expect` and the test's own `expect`.

## Examples

- Given a test that calls `expect` twice and `expect.soft` once,
  when it has finished,
  then its `assertions` tag is 3.
- Given a test that calls its own `({ expect })` once,
  when it has finished,
  then its `assertions` tag is 1.
