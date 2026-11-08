# events.summary-start

- Status: active
- Since: 0.1.0
- Source: old app `summarize` at commit 784f78d

When a run's events are summarized, the events package shall take the run's id, hub, workflow, kind, start time, definitions version, trigger and parent run from the first event. If the stream is empty or doesn't start with `run.started`, then the summary shall be `null`.

## Examples

- Given an empty stream, when it is summarized, then the summary is `null`.
- Given a stream that starts with `state.entered`, when it is summarized, then the summary is `null`.
- Given only `run.started` with a schedule trigger and parent run "p1",
  when it is summarized,
  then the status is "running", the trigger is the schedule trigger, `parentRunId` is "p1", and the usage, cost and lists are empty.
- Given an old `run.started` with `projectId` and `flowId`,
  when it is summarized,
  then `hubId` and `workflowId` come from the old fields.
