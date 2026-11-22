# app.run-send-named-call

- Status: active
- Since: unreleased
- Source: HAL-16382

Where a surface gives the run events service the call id of an approval the person named with the send, the service shall name that call (`SendOptions.callId`), whether or not an older approval waits. When the run no longer waits on that approval, the service shall refuse the send as `conflict` with the reason `answered` and the run's summary, and send nothing. When the run's log never asked for an approval of that call, the service shall refuse the send as `not_found` with the reason `no-call` and the call id, and send nothing.

## Examples

- Given run `run_a1` waiting on the approvals of calls `call-1` and `call-2`,
  when `approve` is sent naming `call-2`,
  then the executor gets `approve` for `run_a1` naming `call-2`.
- Given that the approval of `call-2` was answered and the run still waits on `call-1`,
  when `approve` is sent naming `call-2`,
  then the send is refused as `conflict` with reason `answered`, and `call-1` stays waiting.
- Given run `run_a1` waiting on `call-1` and `call-2`,
  when `approve` is sent naming `call-9`,
  then the send is refused as `not_found` with reason `no-call` and `call-9`.
