# cloudflare-durable.routines-tick-limits

- Status: active
- Since: 0.1.0
- Source: HAL-6802; part 7 review (HAL-6797, Liam, HAL-8315); build plan part 7 (HAL-197)

The routines object shall give up on a tick that has not ended after 2 minutes: the tick rejects with a time limit error, the backup alarm is set as after any tick, and the next tick starts without waiting for the hung one. A failed backup tick shall not be thrown, but shall be reported to the object's log with its name and message only.

Rationale: a listener that never finishes would otherwise hold every later tick, so routines would stop silently; and a backup tick nobody awaits would otherwise fail unseen.

## Examples

- Given a listener that never returns,
  when 2 minutes have passed,
  then the tick rejects with a time limit error and the next tick calls the listener again.
- Given a backup tick that fails,
  when the alarm fires,
  then the failure is reported to the log and nothing is thrown.
