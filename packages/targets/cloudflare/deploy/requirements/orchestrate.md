# deploy.orchestrate

- Status: active
- Since: 0.1.0
- Source: HAL-6704, HAL-6804; build plan 3a (HAL-198); multi-cloud ADR 5.6

The deploy shall run ADR 5.6 steps 1–9 in order: validate, test (production only), take the snapshot from git at a commit, ask for missing secrets, provision, migrate, upload, smoke test, switch traffic. Nothing is created before the secrets are in hand, and migrate, upload and switch run only while the deploy holds the lock, which is freed when the deploy ends, however it ends. A production deploy shall refuse uncommitted changes with `uncommitted-changes` unless `allowDirty` is set; a development deploy shall report how many changed files aren't in it. `plan` shall run validate (not the tests), the snapshot, provision and migrate in read-only mode, take no lock, ask for no secrets and change nothing. Before a deploy that goes live without a trial (Durable Object migrations) on a Worker that already has traffic, the deploy shall report `live-migration-ahead`. An abort between steps stops the deploy with `deploy-aborted`.

Rationale: one ordered path means nothing goes live without its secrets, and no two deploys change one Worker at once.

## Deviations from ADR 5.6

- Step 7: the first deploy of a Worker and a deploy that applies Durable Object migrations upload live and run the self-test afterwards, because Cloudflare applies class changes only with an immediate deploy. A failure then says the new version is deployed. Every other deploy keeps the old version live on failure.
- All provisioning (database, bucket, Worker) runs before the lock, because the lock lives in the database. Two first deploys at once may both try to create a resource; the loser fails on the create and a second run takes the lock.
- `deploy` turns the workers.dev address on for every deploy, so a Worker served only from a custom domain gets it back. Preview addresses stay off.

## Examples

- Given a clean commit, then the steps run in the ADR order, the bundle is built from that commit, and the result names the commit and version.
- Given a production deploy with changed files, then it stops with `uncommitted-changes` before anything is created.
- Given a development deploy with changed files, then it reports the count and deploys.
- Given `plan`, then a fake that fails on any write sees no write, no lock and no question.
- Given a Worker with traffic and Durable Object migrations, then `live-migration-ahead` is reported before the upload.
- Given a failing self-test, then the lock is still freed.
