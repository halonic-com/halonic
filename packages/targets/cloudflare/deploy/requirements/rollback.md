# deploy.rollback

- Status: active
- Since: 0.1.0
- Source: HAL-6705; build plan 3b (HAL-198); multi-cloud ADR 5.6

`rollback` shall switch all traffic back to the version that served before the current one, skipping a version that only ever had 0% of traffic. It shall hold the deploy lock while it chooses and switches, and choose after taking the lock. It shall ask `/health` after the switch and report the answer without undoing the switch. It shall stop with `nothing-to-roll-back` when no earlier version served traffic and with `not-deployed` when the Worker or its database is missing. `plan` shall name the versions and change nothing. Database migrations are not undone.

Rationale: when a version is bad but passed its self-test, one command must put the last good one back, and must not race a deploy.

## Examples

- Given versions A then B live, then `rollback` makes A serve 100% and reports B as the one it left.
- Given a failed deploy left C at 0% above B, then `rollback` from B goes to A, not C.
- Given only one version ever served, then `rollback` stops with `nothing-to-roll-back` and writes nothing.
- Given another deploy holds the lock, then `rollback` stops with `deploy-locked`.
- Given `plan`, then no lock is taken and nothing is written.
