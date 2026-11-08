# spec.verifies-tags-tests

- Status: active
- Since: 0.1.0
- Source: HAL-107

When a test file groups tests with `verifies(id, body)`, the spec package shall name the group after the requirement ID and tag every test inside it, including tests in nested `describe` blocks, with that ID.

## Examples

- Given `verifies("workflow.timer-fires-after-delay", …)` with one test,
  when Vitest collects the file,
  then the test sits in a group titled "workflow.timer-fires-after-delay" and its `requirement` tag is that ID.
- Given a `describe` inside `verifies("workflow.timer-fires-after-delay", …)`,
  when Vitest collects the file,
  then the tests in that `describe` carry the same `requirement` tag.
