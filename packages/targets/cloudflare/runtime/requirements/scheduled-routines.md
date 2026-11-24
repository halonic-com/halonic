# runtime.scheduled-routines

- Status: active
- Since: unreleased
- Source: HAL-17176, HAL-17175

When the cron's tick reaches the deployment's routines object, the Worker shall start each enabled scheduled routine of the deployed snapshot once for each minute it is due, as the routine scheduler of `@halonicjs/app` decides it (UTC, the default tick policy), and shall start none of a disabled routine. A tick of a scope's routines object shall start nothing, because every scope reads the deployment's routines. When a due run fails to start, the tick shall reject with an error that names the routine and the due time, never a value, after the other due runs have started.

Rationale: scheduled routines belong to the deployment; ticking them from every scope would start each one once per scope, and a routine that can't start must show as a failed cron run, not pass in silence.

## Examples

- Given an every-minute routine and ticks at 12:00:30, 12:01:05, 12:01:40 and 12:02:05, then its 12:01 and 12:02 runs each start once.
- Given a disabled every-minute routine, then no tick starts it.
- Given a tick of the routines object of scope `u/acme-user`, then no routine run starts.
- Given an agent routine that the Worker can't start, then the cron run fails with "Routine acme/greet couldn't start its run for …".
