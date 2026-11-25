# events.run-limit-waiting

- Status: active
- Since: unreleased
- Source: HAL-13220, Owen's plan approved with changes by Liam

The run log shall have a `run.limit-waiting` event for a run that reached a limit of its customer's plan before a paid step and waits for `continue` instead of failing, with the run's `state`, the stop's `error` words, its `cause` with a `plan.` code, and `until`, the time when the run fails with the reason `budget` if nobody continues it, and `input`, the input the engine refused, which it decides again on `continue` and no screen shows. The event shall have no cost or token use. While the run waits, its summary shall say "waiting", accept only `continue`, give `until` as its next timer and give the stop as `limit`. When an event is received or the run fails, the summary shall no longer give `limit`.

## Examples

- Given the event types of the run log,
  when they are listed,
  then `run.limit-waiting` is among them.
- Given a `run.limit-waiting` event,
  when its fields are listed,
  then it has `state`, `error`, `cause`, `until` and `input`, all required, and no `cost` or `usage`.
- Given `run.limit-waiting` with cause code `plan.cost` and until "2026-12-02T07:00:00.000Z",
  when it is summarized,
  then the status is "waiting", it accepts only "continue", `nextTimer` is "2026-12-02T07:00:00.000Z", `limit` is the cause and the cost is 0.
- Given `run.limit-waiting` followed by `event.received` "continue",
  when they are summarized,
  then the status is "running", it accepts nothing, and it gives no `limit`.
- Given `run.limit-waiting` followed by `run.failed` with the reason `budget`,
  when they are summarized,
  then the status is "failed", the cause is the failure's, and it gives no `limit`.
- Given a run log written before `run.limit-waiting` existed,
  when it is read,
  then it reads as before.
