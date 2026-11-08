# integration.host-wait

- Status: active
- Since: 0.1.0
- Source: HAL-303 and HAL-306 (`IntegrationHost.wait`, before the port freezes)

The suite shall give the integration a fake `wait` that resolves at once and records each pause clamped as the real host clamps it, so a case can name the pauses a call must take. The conformance suite shall check that the host's `wait` clamps `NaN` and negative values to 0 and `Infinity` to `maxIntegrationWaitMs`, and rejects with the signal's reason when the signal is already aborted or aborts during the wait.

## Examples

- Given an integration that waits `Infinity` ms before its request,
  when the suite runs the case,
  then it doesn't wait and the run records `[30000]`.
- Given a case that expects the pauses `[2000]`,
  when the call waits 1 000 ms instead,
  then the case fails and names both.
- Given a signal that is already aborted,
  when the fake `wait` is called with it,
  then it rejects with the signal's reason and records nothing.
- Given any integration,
  when `describeIntegrationConformance` runs,
  then the host's clamp, the already-aborted signal and abort during the wait are checked.
