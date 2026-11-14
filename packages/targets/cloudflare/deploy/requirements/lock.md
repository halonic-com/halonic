# deploy.lock

- Status: active
- Since: 0.1.0
- Source: HAL-6704, HAL-6804; build plan 3a (HAL-198); multi-cloud ADR 5.6

The deploy shall hold a lock in the deployed database while it changes anything, so two deploys of the same Worker never run at once. The lock is a lease of ten minutes. It shall be taken with one conditional write that wins only when no lease exists or the old one has expired, renewed at each step and in the background during a long step, and freed when the deploy ends, however it ends, and on Ctrl C. A second deploy shall stop with a typed error that names the holder and when it started. A deploy that finds its lease taken over shall stop. `plan` mode shall take no lock.

Rationale: two deploys migrating and uploading at once can leave the database and the live version out of step; a lease frees itself when a deploy crashes without freeing it.

## Examples

- Given no lock, then the deploy takes it, runs, and frees it.
- Given another deploy's unexpired lease, then the deploy stops with `deploy-locked` and the holder and start time, and changes nothing.
- Given another deploy's expired lease, then the deploy takes it over.
- Given a step that takes longer than the lease, then the lease is renewed while the step runs.
- Given the lease was taken over mid-deploy, then the next renewal fails with `deploy-lock-lost`.
- Given the deploy throws or is interrupted, then the lock is freed.
