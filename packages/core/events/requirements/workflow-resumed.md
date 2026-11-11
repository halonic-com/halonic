# events.workflow-resumed

- Status: active
- Since: 0.1.0
- Source: HAL-6173, decided by the CTO on HAL-6144 (option A), for the low finding at report line 310 on HAL-5214

The run log shall have a `workflow.resumed` event for a run in a `workflow` state whose waiting child run runs again, with the `state` and the child's id in `childRunId`. A summary shall read it as the run running again: it accepts nothing, and what it waited on is cleared. It shall update the timeline entry of the `run.waiting` it ends. A reader that meets an event type it doesn't know, as a reader older than this event meets `workflow.resumed`, shall skip it: the summary is as it would be without that event, and the event is its own timeline entry.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `workflow.resumed` is among them, with `state` and `childRunId`.
- Given `run.waiting` with events "approve" and "reject" and child "c1", followed by `workflow.resumed` with child "c1",
  when they are summarized,
  then the status is "running", it accepts nothing, and `waitingOn` and `nextTimer` are `null`.
- Given `run.waiting` (seq 1) followed by `workflow.resumed` (seq 2),
  when their entries are worked out,
  then both events have entry 1.
- Given a waiting run's log with an event of a type the package doesn't know after its `run.waiting`,
  when it is summarized and its entries are worked out,
  then the summary is the same as without that event, and the event is its own entry.
