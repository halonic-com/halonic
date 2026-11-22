# app.run-send-seen-approval

- Status: active
- Since: unreleased
- Source: HAL-16338

Where a surface gives the run events service the run's summary it showed the person with the send, the service shall name the oldest approval that summary lists as the call the event is for (`SendOptions.callId`). When the run no longer waits on that approval, the service shall refuse the send as `conflict` with the reason `answered` and the run's summary, and send nothing, whether the run moved on before the check or between the check and the send. A summary that lists no approval names no call, as `app.run-send` says.

## Examples

- Given run `run_a1` waiting on the approval of call `call-1`, and its summary as a surface showed it,
  when `approve` is sent with that summary,
  then the executor gets `approve` for `run_a1` naming `call-1`.
- Given that the approval of `call-1` was answered somewhere else and the run now waits on `call-2`,
  when `approve` is sent with the summary that showed `call-1`,
  then the send is refused as `conflict` with reason `answered`, and `call-2` stays waiting.
