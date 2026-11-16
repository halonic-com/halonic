# contracts.run-executor-send

- Status: active
- Since: 0.1.0
- Source: HAL-186 implementation plan, E5 and decision 3 (HAL-1515); `RunExecutor` port v1, `SendOptions.callId`; HAL-11240, `RunExecutor` port v2, `SendOptions.wait`

Where an adapter implements `RunExecutor`, it shall refuse a `send` whose `callId` doesn't name the call the run waits on, before it records anything, so the run still waits on its call. It shall deliver an event whose `callId` matches, and an event that names no call. It shall likewise refuse a `send` whose `wait` (a state and the time it started waiting, as the run's summary names them) doesn't name the step the run waits at, before it records anything, and deliver one that matches.

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
- Given a run that waits at step `review` since a time,
  when "approve" is sent with that `wait`,
  then `send` returns the run's summary.
- Given the same run,
  when "approve" is sent with a `wait` naming another step, or an earlier time,
  then `send` is refused, and a later "approve" with the right `wait` is still delivered.
