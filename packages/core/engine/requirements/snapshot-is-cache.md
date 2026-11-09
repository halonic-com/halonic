# engine.snapshot-is-cache

- Status: active
- Since: 0.1.0
- Source: HAL-1527, step 3(b) of the HAL-186 plan; C53 decision 2

When the engine appends a run's events, it shall store the run's state after them as the run's snapshot, with a snapshot version. When it reads a run, it shall start from a snapshot of its own version that matches the log and fold only the events after it. When the snapshot is missing, of another version, of another run or behind the log, the engine shall ignore it and fold the whole log, so a snapshot can be thrown away at any time.

## Examples

- Given a run whose start was stepped,
  when its snapshot is read,
  then it is at event 3 and holds the state folded from the log.
- Given that snapshot,
  when the run is read,
  then only the events after event 3 are read from the log.
- Given a run whose snapshot was dropped or replaced by one of another version,
  when the run is read and stepped,
  then it reads as the folded log and goes on as before.
