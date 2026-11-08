# adapter-scheduler-node.restart

- Status: active
- Since: 0.1.0
- Source: HAL-619; plan 4.4; `Scheduler` port v1 ("kept outside memory so they survive restarts")

The Node scheduler shall keep every timer, with its failure count and next try, as records in the `RecordStore` it was given, and a new scheduler on the same store and collection shall deliver the timers the old one left, at the times they were due. A timer that was being delivered when the process stopped shall be delivered again. When a stored record isn't a timer this scheduler wrote, the scheduler shall reject every call with an error that names the record, and deliver nothing.

## Examples

- Given a scheduler that set a timer for 1 minute from now and was closed,
  when a new scheduler on the same store runs 1 minute later,
  then the new one delivers the timer with the time it was set for.
- Given a timer that failed twice before the restart,
  when the new scheduler's listener rejects it again,
  then its next try comes 4 seconds later.
- Given a collection with a record whose `at` is a number,
  when a scheduler on it lists the pending timers,
  then it rejects with an error that names the record.
