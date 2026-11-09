# contracts.run-executor-send

- Status: active
- Since: 0.1.0
- Source: HAL-186 implementation plan, E5 and decision 3 (HAL-1515); `RunExecutor` port v1, `SendOptions.callId`

Where an adapter implements `RunExecutor`, it shall refuse a `send` whose `callId` doesn't name the call the run waits on, before it records anything, so the run still waits on its call. It shall deliver an event whose `callId` matches, and an event that names no call.

## Examples

- Given a run that waits for approval of call `call-1`,
  when "approve" is sent with `callId: "call-1"`,
  then `send` returns the run's summary.
- Given the same run,
  when "approve" is sent without a `callId`,
  then `send` returns the run's summary.
- Given the same run,
  when "approve" is sent with `callId: "call-1-other"`,
  then `send` is refused, and a later "approve" with `callId: "call-1"` is still delivered.
