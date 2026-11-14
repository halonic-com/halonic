# runtime.scheduled

- Status: active
- Since: 0.1.0
- Source: HAL-6802, HAL-8635; build plan parts 7 and 9 (HAL-197)

The Worker's `scheduled()` shall run on a cron trigger every minute. Each run shall hand the cron's scheduled time to the routines object's tick and then sweep the watchdog, and shall run both even when the other fails. When the tick failed or the watchdog could not check a run, `scheduled()` shall reject with an error that names what failed and the ids of the runs, never a value, after both have run. When the deployment lacks a binding or a secret, it shall fail with the configuration error before either runs.

Rationale: a stopped or failing cron must not stop routines or leave a stuck run stuck without anyone seeing it, and one failing half must not starve the other.

## Examples

- Given a cron run for 12:00, then the routines object ticks for `12:00` and the watchdog sweeps once.
- Given a tick that fails, then the watchdog still sweeps and `scheduled()` rejects with "The routine tick failed."
- Given a watchdog that cannot check run `r1`, then the tick still ran and `scheduled()` rejects naming `r1`.
- Given an `env` without `BLOBS`, then neither runs and the configuration error names `BLOBS`.
