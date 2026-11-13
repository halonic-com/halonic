# cloudflare-durable.watchdog-limits

- Status: active
- Since: 0.1.0
- Source: HAL-6802; part 7 review (HAL-6797, Liam, HAL-8315); build plan part 7 (HAL-197)

A watchdog sweep shall check at most a fixed number of runs (40 by default) and report how many it left for later. It shall take the runs in the order of their ids, in groups of that size, and pick the group by the minute, so every run is checked within a few minutes. It shall not wake a run whose own log says it has ended, even while the run list, which may lag, still shows it as running.

Rationale: each check is a call to a run object, and one Worker invocation may make only a limited number of calls; a run that has ended needs no waking.

## Examples

- Given 25 stuck runs and a limit of 10,
  when the watchdog sweeps three minutes in a row,
  then each sweep checks at most 10 and together they check all 25.
- Given a run the list shows as running whose own log has ended,
  when the watchdog sweeps,
  then it wakes nothing.
