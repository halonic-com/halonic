# studio.run-log

- Status: active
- Since: 0.1.0
- Source: HAL-1301 (T8 PR 5, one run's log)

When the run page asks for one run's log, the desktop app shall read the run's whole log from the same file the CLI writes, from its first event to its last.

## Examples

- Given a run of Acme's `reply` workflow waiting at its `publish` call,
  when its log is read,
  then it starts with `run.started` and ends with the event the Runs list last saw.
