# events.summary-waiting

- Status: active
- Since: 0.1.0
- Source: old app `summarize` at commit 784f78d; old test `studio.test.ts` checks `nextTimer`

While a run waits, its summary shall say "waiting", which events it accepts, which child run it waits on and when its earliest timer is due. The summary shall keep the time of the last `run.waiting`, also after the run goes on, and `null` if the run never waited. When an event is received, a child workflow finishes, a timer fires or a new state is entered, the run shall be "running" again; the first three also clear what it waited on.

## Examples

- Given `run.waiting` with events "approve" and "reject", child "c1" and timers due at "2026-11-05T09:00:00.000Z" and "2026-11-05T08:00:00.000Z",
  when it is summarized,
  then the status is "waiting", it accepts "approve" and "reject", `waitingOn` is "c1" and `nextTimer` is "2026-11-05T08:00:00.000Z".
- Given `run.waiting` at "T2", `event.received`, `run.waiting` at "T4" and `event.received`,
  when they are summarized,
  then the status is "running" and the last waiting time is "T4".
- Given `run.waiting` with no timers and no child,
  when it is summarized,
  then `nextTimer` and `waitingOn` are `null`.
- Given `run.waiting` followed by `timer.fired` (or `event.received`, or `workflow.finished`),
  when they are summarized,
  then the status is "running", it accepts nothing, and `waitingOn` and `nextTimer` are `null`.
- Given `run.waiting` followed by `state.entered`,
  when they are summarized,
  then the status is "running".
