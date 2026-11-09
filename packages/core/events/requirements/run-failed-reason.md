# events.run-failed-reason

- Status: active
- Since: 0.1.0
- Source: [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan), "Budget stops inside foreach and sub-workflows"; task HAL-1525. `model-missing` and `model-no-tools`: [plan-providers](/HAL/issues/HAL-1061#document-plan-providers), approved on HAL-1880

The events package shall let a `run.failed` event say why the run failed in an optional `reason`: `budget` when a run or monthly budget stopped it, `cancelled` when someone cancelled it, `model-missing` when the model it asked for doesn't exist at its provider, `model-no-tools` when that model can't call tools and the step offered some, or `error` when something else went wrong. Logs written before the field existed read as before; the `error` text stays the message to show.

## Examples

- Given a `run.failed` event with `reason: "budget"`, or with `reason: "model-no-tools"`,
  when its type is checked,
  then it is a valid run event.
- Given a `run.failed` event without `reason`,
  when its type is checked,
  then it is a valid run event.
- Given the reason type,
  when it is listed,
  then it is exactly `budget`, `cancelled`, `model-missing`, `model-no-tools` and `error`.
