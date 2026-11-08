# spec.verifies-rejects-bad-ids

- Status: active
- Since: 0.1.0
- Source: HAL-107

If `verifies` is called with a text that is not a requirement ID, or inside another `verifies`, then the spec package shall throw an error that says what is wrong.

## Examples

- Given the ID "workflow" (no name part),
  when a test file calls `verifies("workflow", …)`,
  then it throws "is not a requirement ID".
- Given the IDs "Workflow.timer", "workflow.timer_fires" and "workflow..timer",
  when a test file calls `verifies` with any of them,
  then it throws "is not a requirement ID".
- Given a `verifies` block,
  when its body calls `verifies` again,
  then the inner call throws "inside another verifies()".
