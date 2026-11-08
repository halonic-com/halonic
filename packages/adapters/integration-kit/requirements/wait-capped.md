# integration-kit.wait-capped

- Status: active
- Since: 0.1.0
- Source: HAL-303 and HAL-306 (an integration may not use timers; the MCP transport honours `retry:`)

The host's `wait(ms, signal?)` shall own the integration's only timer. It shall wait `ms` clamped to `0 … maxIntegrationWaitMs` (30 000 ms), with `NaN` and negative values waiting 0 and `Infinity` waiting the maximum. It shall reject with `signal.reason` when `signal` is already aborted or aborts during the wait, and then clear its timer.

## Examples

- Given `wait(2000)`,
  when 1 999 ms have passed,
  then it hasn't resolved; after 2 000 ms it has.
- Given `wait(Infinity)`, `wait(NaN)` or `wait(-5)`,
  when it is called,
  then it waits 30 000 ms, 0 ms and 0 ms.
- Given a signal that is already aborted,
  when the integration waits,
  then it rejects with the signal's reason and starts no timer.
- Given a signal that aborts during the wait,
  when it aborts,
  then the wait rejects with the signal's reason and no timer is left.
