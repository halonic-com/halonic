# ports.team-runs

- Status: active
- Since: unreleased
- Source: Runs app build plan (HAL-18624, approved on HAL-18629); the activity panel's fields (HAL-18628); task HAL-18650

The `TeamStatus` port shall have an optional `runs(query)` read through which Studio's Runs app and activity panel read team agents' runs, one answer per source, optionally for one agent and with the finished runs since a bound. A run shall carry only its opaque ID, source, agent, task (opaque ID, identifier and title, or none for a run without a task), state, start, finish and last activity times, billed money and tokens when known, and whether it can be stopped: no log, output, prompt, error text or wake reason. An answer shall say when it is not complete because the source returned only the latest of the finished runs. Adding it shall leave `teamStatusVersion` at 1.

## Examples

- Given the `TeamRun` type,
  when its fields are listed,
  then they are exactly the ones above, and a log or error field doesn't compile.
- Given a source without runs,
  when it is typed as a `TeamStatus`,
  then it still compiles.
