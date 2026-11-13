# cloudflare-durable.watchdog

- Status: active
- Since: 0.1.0
- Source: HAL-6797; build plan part 7 (HAL-197); multi-cloud ADR 5.3; design review HAL-6790 (Elena, 12 Nov)

The Cloudflare watchdog shall wake a running or waiting run only when it has a timer that has been due and undelivered for at least 2 minutes, or when it is running and its log has had no new event for at least 10 minutes. It shall wake a run by setting the run's `watchdog` timer for the current time, which also gets its overdue timers delivered. It shall not wake a run that is waiting with no overdue timer, however long it has waited, nor a run whose timers are all in the future. A run whose check or wake fails shall be reported and shall not stop the others.

## Examples

- Given a run waiting for an approval for three days with no timer due,
  when the watchdog sweeps,
  then it wakes nothing.
- Given a waiting run whose timer came due 5 minutes ago and was never delivered,
  when the watchdog sweeps,
  then it sets the run's `watchdog` timer for now and the overdue timer is delivered with it.
- Given a running run whose last event was 15 minutes ago,
  when the watchdog sweeps,
  then it wakes the run for "no-progress".
- Given a running run whose last event was 1 minute ago,
  when the watchdog sweeps,
  then it wakes nothing.
- Given two runs where the first run object fails to answer,
  when the watchdog sweeps,
  then the failure is in the report and the second run is still checked.
