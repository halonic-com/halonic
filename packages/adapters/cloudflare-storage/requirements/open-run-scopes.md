# cloudflare-storage.open-run-scopes

- Status: active
- Since: unreleased
- Source: HAL-17158 (follow-up of HAL-17134: the cron watchdog sweeps every scope)

The D1 run list's `listOpenRunScopes` shall name, in order and once each, every scope of the D1 run list that has a running or waiting run, and shall leave out the empty scope of a deployment with no principal and every scope whose runs have all ended.

Rationale: each scope's runs are listed only under that scope, so the watchdog needs the scopes to build each one's runtime; a scope with no open run has nothing to sweep, and the empty scope is swept by the deployment's own runtime.

## Examples

- Given a running run under `u/eu_a` and one under `o/org_a`, and only a completed run under `u/eu_b`,
  when the scopes with open runs are listed,
  then they are `o/org_a` and `u/eu_a`, in that order, and neither `u/eu_b` nor the empty scope.
