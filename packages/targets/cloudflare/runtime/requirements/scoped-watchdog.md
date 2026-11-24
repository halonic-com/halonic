# runtime.scoped-watchdog

- Status: active
- Since: unreleased
- Source: HAL-17158 (follow-up of HAL-17134: each scope's runs are listed only under that scope)

When the Worker's cron runs the watchdog, it shall sweep the deployment's own runs with the deployment's runtime, and then, for each scope that has a running or waiting run, sweep that scope's runs with that scope's runtime (`scopedRuntime`), so a stuck run is woken under the scope it was written in and never unscoped. A scope name that is not a principal's `u/<id>` or `o/<id>` shall get no runtime. One cron run shall sweep at most a fixed number of scopes, taken in turn by the minute, so every scope is swept every few minutes. A scope whose sweep fails, or a run in it the watchdog cannot check, shall not stop the other scopes, and the cron run shall reject with an error that names the scope and the run, never a value.

Rationale: since HAL-17134 a scope's runs are only in that scope's run list, so a sweep of the unscoped list alone never finds a stuck run of a user or an organisation.

## Examples

- Given a stuck run in `u/eu_acme…` and one in `o/org_acme…`, when the cron sweeps, then both are woken, each reported with its own scope, and no unscoped run object is touched for either.
- Given an open run under a name that is no principal's scope, such as `acme-legacy`, when the cron sweeps, then no runtime is built for it and nothing fails.
- Given a scope whose watchdog cannot check run `r1`, then the other scopes are still swept and the cron run rejects with "The watchdog couldn't check run r1 in scope u/eu_acme…."
- Given three scopes and two a sweep, then minute 0 sweeps the first two, minute 1 the third, and minute 2 the first two again.
