# deploy.status

- Status: active
- Since: 0.1.0
- Source: HAL-6705; build plan 3b (HAL-198); multi-cloud ADR 5.6

`status` shall say what is live for a Worker: its workers.dev address, each version that serves traffic with its share, the commit and bundle hash the deploy noted on it, whether those match the caller's own, and whether `/health` answers. It shall only read: no lock, no write. A Worker with no live version shall report `deployed: false`. A health check that can't get an answer shall report `unreachable`, never throw. A deploy shall note the short commit and bundle hash on every version it uploads, so `status` can read them back.

Rationale: after a deploy, or a bad night, the first question is "what is running, and is it mine?".

## Deviations from ADR 5.6

- The last routine tick is not reported yet: the Worker has no route that says it, and adding one belongs to the runtime.

## Examples

- Given a live version deployed from commit `abc…`, then `status` names that commit and bundle, and says whether the caller's match.
- Given two versions sharing traffic, then `status` lists both and sets `splitTraffic`.
- Given a Worker that was never deployed, then `status` reports `deployed: false`.
- Given a fake that fails on any write, then `status` still succeeds.
- Given `/health` doesn't answer, then `status` reports `unreachable`.
