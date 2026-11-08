# contracts.run-store-empty-status

- Status: active
- Since: 0.1.0
- Source: HAL-650; `RunStore` port v1, `RunFilter.status`

Where an adapter implements `RunStore`, it shall treat an empty status list given to `list` as no status filter, the same as leaving `status` out, and still narrow the list by the other filter fields.

## Examples

- Given a completed run and a running test run,
  when the list is filtered by `status: []`,
  then it gives both, newest start first.
- Given the same runs,
  when the list is filtered by `status: []` and `kind: "run"`,
  then it gives only the completed run.
