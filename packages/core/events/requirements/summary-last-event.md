# events.summary-last-event

- Status: active
- Since: 0.1.0
- Source: new in the core events package: writers need the last sequence number to append, and the watchdog needs the last event time

When a run's events are folded, the events package shall set the summary's `lastSeq` and `updatedAt` to the sequence number and time of the last event, whatever its type. These two fields are new compared with the old summary; they are derived, so the run log doesn't change.

## Examples

- Given `run.started` (1), then `state.entered` "a" (2) at "T2" and `state.entered` "b" (3) at "T3",
  when they are summarized,
  then `lastSeq` is 3 and `updatedAt` is "T3".
- Given `run.started` (1) and a `transition` (2) at "T2", which changes nothing else,
  when they are summarized,
  then `lastSeq` is 2 and `updatedAt` is "T2".
- Given only `run.started` at "S",
  when it is summarized,
  then `lastSeq` is 1 and `updatedAt` is "S".
