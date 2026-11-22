# paperclip.github-snapshot-store

- Status: active
- Since: unreleased
- Source: HAL-16003; the supervision plugins plan on HAL-15997 (change 5: the snapshot is kept in plugin state, and `queue_state` and `merge_speed` read it there), approved by the board on 22 Nov

When the PR watcher job has taken a company's GitHub snapshot, the plugin shall save it in plugin state for that company in place of the one before, decide on the company's tasks from it even if the save fails, and log a failed save; and when a reader loads a snapshot whose shape version it doesn't read, the plugin shall refuse it.

## Examples

- Given a company whose pass reads #4485 as merged,
  when the pass ends,
  then the company's saved snapshot has the pass's time and #4485 as merged, and a company without a pass has none.
- Given a saved snapshot of version 2,
  when a reader of version 1 loads it,
  then it refuses it and names both versions.
- Given a plugin state store that refuses the save,
  when the pass runs with dry run off,
  then it still marks the task done, and logs that it couldn't save the snapshot.
