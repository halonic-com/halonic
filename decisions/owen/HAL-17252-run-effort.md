# Decision: the run log contract lists `run.started.effort`

- Approval: /HAL/issues/HAL-17252
- Kind: internal

A run can now be started with less thinking for its harness agents (token
phase 1c). The run's `low` effort is kept on `run.started` as a new optional
field, as `run.started.harness` is, so a resumed or replayed run keeps it.
`events.run-log-contract` lists every field added to the reference events, so
it gains `run.started.effort` and its requirement `events.run-started-effort`.
No field is taken away and no test is weakened.

## Covers

- events.run-log-contract
