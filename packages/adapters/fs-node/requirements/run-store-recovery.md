# fs-node.run-store-recovery

- Status: active
- Since: 0.1.0
- Source: HAL-1635

The folder run store shall count an event as stored only once its line break is written. It shall skip whatever follows the last line break as a line a crash cut off, and cut it off before the next append. A broken line before the last line break shall be an error naming the file and line. `snapshot()` shall give `null` when the snapshot file is missing, unreadable or ahead of the log, so the engine replays the log, and an append whose snapshot can't be written shall still store its events. When writing the events fails, it shall cut the log back to its size before the append and pass the error on, so a failed append stores none of its events.

## Examples

- Given run `r1` with three events and half a fourth line after them,
  when `events("r1")` is called,
  then it gives events 1 to 3, and `append("r1", 3, [event 4])` succeeds.
- Given a log whose second line is `{not json`,
  when `events("r1")` is called,
  then it throws `Broken run log r1.jsonl, line 2`.
- Given a snapshot at seq 4 and a log cut back to three events,
  when `snapshot("r1")` is called,
  then it gives `null`.
- Given run `r1` with three events and a write that fails after the first of three new lines,
  when `append("r1", 3, [events 4 to 6])` is called,
  then it rejects with the write's error, and `events("r1")` gives events 1 to 3.
