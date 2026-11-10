# contracts.run-store-started-since

- Status: active
- Since: 0.1.0
- Source: HAL-3881; `RunStore` port v1, `RunFilter.startedSince`, so the engine's monthly spend reads only this month's runs

Where an adapter implements `RunStore`, it shall give from `list` with `startedSince` only the runs whose `startedAt` is at or after that time, compared as times rather than as text, and still narrow the list by the other filter fields.

## Examples

- Given runs that started at the last millisecond of January, on 1 February and on 1 March,
  when the list is filtered by `startedSince: "2026-02-01T00:00:00.000Z"`,
  then it gives the March and February runs, newest start first.
- Given the same runs,
  when the list is filtered by the same time written as `2026-02-01T01:00:00+01:00`,
  then it gives the same two runs.
