# fs-node.run-store-started-since

- Status: active
- Since: 0.1.0
- Source: HAL-3881; the engine's monthly spend reads only this month's runs (review of #1153 on HAL-3821)

When `list` is given `startedSince`, the folder run store shall tell from the first line of each log alone whether the run started before that time, and shall not read the rest of such a log. When the first line can't tell, because it is broken, it shall read the log whole, so a broken log is still reported with its file and line.

## Examples

- Given a run that started on 1 January and whose second line is broken, and a run that started on 1 February,
  when `list({ startedSince: "2026-02-01T00:00:00.000Z" })` is called,
  then it gives only the February run, and reads only the February run's log whole.
- Given a log whose first line is broken,
  when `list({ startedSince })` is called,
  then it throws an error naming the file and line 1.
